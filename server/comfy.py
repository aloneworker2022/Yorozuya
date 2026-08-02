"""ComfyUI 對接 + GPU 換班仲裁(RP5 端)

Windows 那台把 ComfyUI 與 Ollama **兩個都常駐**,不再由排程器開開關關。
同一張卡不能同時餵兩邊,所以「誰現在能用 VRAM」由這裡仲裁:

    要跑聊天 → 先 POST ComfyUI /free   把 checkpoint 卸出 VRAM
    要生圖   → 先 GET  Ollama /api/ps  看誰在 VRAM 裡,逐一 keep_alive:0

兩個關鍵設計:

1. **不寫死模型名**。/api/ps 回報當下真的載入的模型,掃到什麼卸什麼,
   換模型、多模型並存都不用改程式。
2. **黏著**(sticky)。只有「換邊」那一次才付卸載+重載的成本;連續聊十句
   或連續生十張圖,中間一次都不卸。

失敗一律不擋路:對方連不上就當它沒佔 VRAM,繼續做自己的事——寧可讓
ComfyUI 自己 OOM 報錯,也不要因為卸載失敗就讓玩家的聊天卡死。
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import time
from pathlib import Path

import httpx

# 預設值,只是「還沒有人告訴我位址」時的退路。RP5 與 GPU 主機通常不是同一台,
# 所以真正的位址由前端設定帶進來(跟 ollamaUrl 同一套做法),見 note_comfy_url。
# 退路寫顯卡那台的區網 IP 而不是 localhost:localhost 在 RP5 上指的是 RP5 自己,
# 那台沒有顯卡,拿它當退路等於「沒填就一定失敗」。
COMFY_URL = os.environ.get("COMFY_URL", "http://192.168.68.55:8188").rstrip("/")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
# 一張圖從送出到收檔的上限。含換班重載 checkpoint 的時間。
COMFY_TIMEOUT = float(os.environ.get("COMFY_TIMEOUT", "300"))
# 預設 checkpoint;留空 = 開機時問 ComfyUI 有哪些,取第一個
COMFY_CKPT = os.environ.get("COMFY_CKPT", "").strip()

# 預設對著 Illustrious / SDXL 系(animij v3 那條線)。改模型改這一組即可。
#
# 注意 animij 有兩條血統:v3 及更早是 Illustrious(SDXL),吃 CheckpointLoaderSimple;
# v10 換成 Anima(NVIDIA Cosmos)底,要另外掛 qwen_image_vae + anima_baseV10_txt,
# 下面這份 8 節點 workflow 載不動它。/api/comfy/status 的 checkpoint 檔名可以判斷。
DEFAULT_WIDTH = int(os.environ.get("COMFY_WIDTH", "832"))
DEFAULT_HEIGHT = int(os.environ.get("COMFY_HEIGHT", "1216"))
DEFAULT_STEPS = int(os.environ.get("COMFY_STEPS", "30"))
DEFAULT_CFG = float(os.environ.get("COMFY_CFG", "5.0"))
DEFAULT_SAMPLER = os.environ.get("COMFY_SAMPLER", "euler_ancestral")
DEFAULT_SCHEDULER = os.environ.get("COMFY_SCHEDULER", "normal")
# Illustrious 系建議 CLIP skip 2(= 停在倒數第二層)。0 或 -1 = 不跳。
DEFAULT_CLIP_SKIP = int(os.environ.get("COMFY_CLIP_SKIP", "2"))

# 召喚三連拍。每位妹子固定出這三張,遊戲各處各取所需:
#   head → 名冊縮圖、聊天頭像(小方格,留背景比較好看,不去背)
#   half → 聊天立繪(文字冒險式,站在對話框上方)
#   full → 看板娘背景板(接近整個螢幕)
#
# 算圖尺寸挑 SDXL 的標準桶(1024×1024 / 832×1216)。
# half / full **不縮圖**(out 留空):它們要撐滿手機畫面,縮到 192 寬再放大只會糊。
# plan-v4 訂的 192×288 是像素 sprite 時代的規格,改用 SDXL 出圖後那個尺寸太小。
# head 縮到 256 是因為它只顯示在 2em 見方的頭像框裡,留大圖純浪費。
PORTRAIT_SHOTS = {
    "head": {"gen": (1024, 1024), "out": (256, 256), "cutout": False},
    "half": {"gen": (832, 1216), "out": (0, 0), "cutout": True},
    "full": {"gen": (832, 1216), "out": (0, 0), "cutout": True},
}

# 不寫在 prompt 裡的通用排除項。分級由抽卡管,這裡只管畫面品質。
DEFAULT_NEGATIVE = (
    "worst quality, low quality, blurry, jpeg artifacts, watermark, text, "
    "signature, username, bad anatomy, bad hands, extra digits, extra limbs"
)


# ---------------------------------------------------------------- GPU 仲裁

_GPU_LOCK = asyncio.Lock()
_holder: str | None = None          # "llm" | "comfy" | None
_last_switch: float = 0.0
_switches: int = 0
# 設定頁填的位址會蓋掉環境變數預設值:聊天/生圖實際走哪台,就對哪台下卸載
# 指令,免得仲裁對著一台沒人用的服務空揮。RP5 與 GPU 主機不同機時尤其重要
# ——localhost 在 RP5 上指的是 RP5 自己,永遠不會是那張顯卡。
_ollama_seen: str = ""
_comfy_seen: str = ""


def note_ollama_endpoint(endpoint: str) -> None:
    """記下實際在用的 Ollama 位址(由聊天路徑回報)。"""
    global _ollama_seen
    ep = (endpoint or "").strip().rstrip("/")
    if ep and ep not in ("grok-build", "grok-img", "grok", "xai"):
        _ollama_seen = ep


def note_comfy_url(url: str) -> None:
    """記下實際在用的 ComfyUI 位址(由生圖/檢查路徑回報)。"""
    global _comfy_seen
    u = (url or "").strip().rstrip("/")
    if u:
        _comfy_seen = u


def ollama_url() -> str:
    return _ollama_seen or OLLAMA_URL


def comfy_url() -> str:
    return _comfy_seen or COMFY_URL


async def _unload_ollama() -> None:
    """把當下載在 VRAM 的 Ollama 模型全部卸掉(不寫死模型名)。"""
    base = ollama_url()
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            ps = (await c.get(f"{base}/api/ps")).json()
            for m in ps.get("models") or []:
                name = m.get("model") or m.get("name")
                if not name:
                    continue
                # keep_alive:0 且不帶 prompt = 純卸載,不會真的跑一次生成
                await c.post(
                    f"{base}/api/generate",
                    json={"model": name, "keep_alive": 0},
                )
    except Exception as e:  # noqa: BLE001 — 卸不掉不該擋住生圖
        print(f"[GPU] Ollama 卸載略過:{type(e).__name__}", flush=True)


async def _unload_comfy() -> None:
    """把 ComfyUI 的 checkpoint 卸出 VRAM。進程照活,不必殺。"""
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            await c.post(
                f"{comfy_url()}/free",
                json={"unload_models": True, "free_memory": True},
            )
    except Exception as e:  # noqa: BLE001 — 卸不掉不該擋住聊天
        print(f"[GPU] ComfyUI 卸載略過:{type(e).__name__}", flush=True)


class lease:
    """`async with comfy.lease("llm"):` —— 取得 GPU 使用權,必要時把對方卸掉。

    同時只有一邊拿得到;已經是自己在用就直接放行(不重複卸載)。
    """

    def __init__(self, who: str):
        assert who in ("llm", "comfy")
        self.who = who

    async def __aenter__(self):
        global _holder, _last_switch, _switches
        await _GPU_LOCK.acquire()
        if _holder != self.who:
            t0 = time.time()
            if self.who == "comfy":
                await _unload_ollama()
            else:
                await _unload_comfy()
            _holder = self.who
            _last_switch = time.time()
            _switches += 1
            print(f"[GPU] 換班 → {self.who}({time.time() - t0:.1f}s)", flush=True)
        return self

    async def __aexit__(self, *exc):
        _GPU_LOCK.release()
        return False


def gpu_state() -> dict:
    return {
        "holder": _holder,
        "busy": _GPU_LOCK.locked(),
        "switches": _switches,
        "last_switch": _last_switch,
        "ollama_url": ollama_url(),
        "comfy_url": comfy_url(),
    }


# ------------------------------------------------------------ ComfyUI 查詢


async def system_stats(base: str = "") -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            return (await c.get(f"{base or comfy_url()}/system_stats")).json()
    except Exception:  # noqa: BLE001
        return None


# 各 loader 節點與它列檔案的欄位。問 ComfyUI「你有哪些檔」,RP5 不寫死清單。
_LOADER_FIELDS = {
    "checkpoints": ("CheckpointLoaderSimple", "ckpt_name"),
    "unets": ("UNETLoader", "unet_name"),
    "text_encoders": ("CLIPLoader", "clip_name"),
    "vaes": ("VAELoader", "vae_name"),
}


async def _loader_options(node: str, field: str, base: str = "") -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            info = (await c.get(f"{base or comfy_url()}/object_info/{node}")).json()
        return [str(x) for x in info[node]["input"]["required"][field][0]]
    except Exception:  # noqa: BLE001
        return []


async def checkpoints(base: str = "") -> list[str]:
    """問 ComfyUI 現在有哪些 checkpoint —— 不在 RP5 這邊寫死清單。"""
    return await _loader_options("CheckpointLoaderSimple", "ckpt_name", base)


async def model_lists(base: str = "") -> dict[str, list[str]]:
    """一次問完四種 loader 的檔案清單。

    判斷手上的模型是「單件式」還是「三件式」要看這個:checkpoints 有但生圖時
    噴 CLIP is None,就代表那個檔其實是只含主模型的單件檔(Anima/Cosmos、Flux…),
    要配 text_encoders 與 vaes 裡的檔案走三件式才載得動。
    """
    names = list(_LOADER_FIELDS)
    got = await asyncio.gather(*(
        _loader_options(node, field, base) for node, field in _LOADER_FIELDS.values()
    ))
    return dict(zip(names, got))


# 試過、確定這份 workflow 載不動的 checkpoint(只含主模型的單件檔)。
# models/checkpoints 裡混著這種檔時,「取清單第一個」就是一顆地雷——踩到一次
# 就記起來,之後自動跳過,不要每次召喚都拿同一個壞檔去撞。
_BAD_CKPTS: set[str] = set()


def bad_ckpts() -> list[str]:
    return sorted(_BAD_CKPTS)


async def resolve_ckpt(want: str = "", base: str = "") -> tuple[str, str | None, bool]:
    """把使用者給的 checkpoint 名對到實際存在的檔名。
    回 (檔名, 錯誤, 是否為自動挑的)。自動挑的才允許失敗後換下一個試。

    指定了就照指定的(即使在黑名單裡)——使用者說了算,只是會失敗而已。
    沒指定 → COMFY_CKPT → 清單裡第一個「沒被標壞」的。"""
    avail = await checkpoints(base)
    if not avail:
        return "", "ComfyUI 連不上,或 models/checkpoints 是空的", False
    for cand in (want.strip(), COMFY_CKPT):
        if not cand:
            continue
        if cand in avail:
            return cand, None, False
        # 只給了不含副檔名/資料夾的片段也接受
        hit = [a for a in avail if cand.lower() in a.lower()]
        if hit:
            return hit[0], None, False
    usable = [a for a in avail if a not in _BAD_CKPTS]
    if not usable:
        return "", (
            "models/checkpoints 裡每一個都試過了,沒有一個含文字編碼器(CLIP)。"
            "請放一個 SDXL/Illustrious 的完整 checkpoint,或在設定頁指定要用哪個。"
        ), False
    return usable[0], None, True


# ------------------------------------------------------- workflow builder
# 這裡就是 plan-v4 §8.3 說的「廠商替換點」:回傳 ComfyUI /prompt 吃的 API 格式
# workflow。之後要換模型、加 LoRA、加色彩量化,改這一個函式就好,worker 不看內容。


def build_workflow(
    *,
    ckpt: str,
    positive: str,
    negative: str = "",
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    out_width: int = 0,
    out_height: int = 0,
    steps: int = DEFAULT_STEPS,
    cfg: float = DEFAULT_CFG,
    sampler: str = DEFAULT_SAMPLER,
    scheduler: str = DEFAULT_SCHEDULER,
    clip_skip: int = DEFAULT_CLIP_SKIP,
    seed: int = 0,
    filename_prefix: str = "yorozuya/img",
) -> dict:
    """txt2img。out_width/out_height 給值 = 生完再縮到那個尺寸。

    高解析生 → 縮小,是刻意的:SD 在 512(1.5)/1024(XL)解析度訓練,
    直接叫它畫 192 寬會出一坨爛泥。縮圖用 nearest-exact 不做平滑內插,
    邊緣保持硬的才有像素風顆粒感(plan-v4 §立繪 192×288)。
    """
    wf: dict = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": ckpt},
        },
    }
    clip_src = ["1", 1]
    if clip_skip and clip_skip > 1:
        wf["9"] = {
            "class_type": "CLIPSetLastLayer",
            "inputs": {"clip": ["1", 1], "stop_at_clip_layer": -int(clip_skip)},
        }
        clip_src = ["9", 0]
    wf |= {
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": clip_src},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": clip_src},
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": int(width), "height": int(height), "batch_size": 1},
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": int(seed),
                "steps": int(steps),
                "cfg": float(cfg),
                "sampler_name": sampler,
                "scheduler": scheduler,
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
            },
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
        },
    }
    src = ["6", 0]
    if out_width and out_height:
        wf["7"] = {
            "class_type": "ImageScale",
            "inputs": {
                "upscale_method": "nearest-exact",
                "width": int(out_width),
                "height": int(out_height),
                "crop": "disabled",
                "image": ["6", 0],
            },
        }
        src = ["7", 0]
    wf["8"] = {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": filename_prefix, "images": src},
    }
    return wf


# ------------------------------------------------------------- 送單與收圖


async def _submit(client: httpx.AsyncClient, base: str, wf: dict, client_id: str) -> tuple[str, str | None]:
    r = await client.post(f"{base}/prompt", json={"prompt": wf, "client_id": client_id})
    if r.status_code >= 400:
        # ComfyUI 的節點錯誤都在 body 裡,原文帶回去比 HTTP 狀態碼有用得多
        try:
            detail = json.dumps(r.json(), ensure_ascii=False)[:600]
        except Exception:  # noqa: BLE001
            detail = r.text[:600]
        return "", f"ComfyUI 拒收(HTTP {r.status_code}):{detail}"
    data = r.json()
    if data.get("node_errors"):
        return "", f"節點錯誤:{json.dumps(data['node_errors'], ensure_ascii=False)[:600]}"
    pid = data.get("prompt_id")
    return (pid, None) if pid else ("", "ComfyUI 沒回 prompt_id")


async def _wait_history(client: httpx.AsyncClient, base: str, pid: str, deadline: float) -> tuple[dict, str | None]:
    """輪詢 /history 直到這張圖跑完。ComfyUI 沒有「完成」推播給 HTTP 客戶端,
    要嘛開 websocket 要嘛輪詢;輪詢少一個連線狀態要顧,這裡夠用。"""
    while time.time() < deadline:
        r = await client.get(f"{base}/history/{pid}")
        if r.status_code < 400:
            h = r.json().get(pid)
            if h:
                status = h.get("status") or {}
                if status.get("status_str") == "error" or (
                    status.get("completed") is False and status.get("messages")
                ):
                    return {}, _explain_error(status)
                if h.get("outputs"):
                    return h, None
        await asyncio.sleep(0.5)
    return {}, f"ComfyUI 逾時({COMFY_TIMEOUT:.0f}s 沒收到圖)"


# 「checkpoint 裡沒有文字編碼器/VAE」在 ComfyUI 只會噴 'NoneType' has no attribute
# 'clone' 這種看不出所以然的東西。這類檔案(Anima/Cosmos、Flux、Qwen-Image…)是
# 只含主模型的單件檔,要 UNETLoader + CLIPLoader + VAELoader 三件式才載得起來,
# CheckpointLoaderSimple 拿到的 CLIP 就是 None。翻成人話,不要讓人去讀 traceback。
_MISSING_ENCODER_SIGNS = (
    "clip input is invalid",
    "'nonetype' object has no attribute 'clone'",
    "no clip/text encoder weights",
)
# 錯誤訊息開頭的暗號:呼叫端靠它判斷「這個 checkpoint 該進黑名單、換下一個試」,
# 而不是拿整串中文去做字串比對
MISSING_ENCODER_TAG = "[no-clip]"


def _explain_error(status: dict) -> str:
    for kind, payload in status.get("messages") or []:
        if kind == "execution_error" and isinstance(payload, dict):
            node = payload.get("node_type") or payload.get("node_id")
            msg = str(payload.get("exception_message") or payload.get("exception_type") or "")
            low = msg.lower()
            if any(s in low for s in _MISSING_ENCODER_SIGNS) or node in (
                "CLIPTextEncode", "CLIPSetLastLayer"
            ):
                return MISSING_ENCODER_TAG + (
                    "這個 checkpoint 裡沒有文字編碼器(CLIP),CheckpointLoaderSimple 載不起來。"
                    "常見於 Anima / Cosmos、Flux、Qwen-Image 這類「只含主模型」的單件檔——"
                    "它們要 UNETLoader + CLIPLoader + VAELoader 三件式,text_encoder 與 VAE "
                    f"要另外下載放進 models/。請改用內含 CLIP 的 SDXL/Illustrious checkpoint。(原文:{msg[:200]})"
                )
            return f"{node}: {msg}"[:600]
    return "ComfyUI 執行失敗"


def _images_of(history: dict) -> list[dict]:
    out = []
    for node_out in (history.get("outputs") or {}).values():
        for img in node_out.get("images") or []:
            if img.get("type") == "output":
                out.append(img)
    return out


async def generate(
    *,
    positive: str,
    negative: str = "",
    ckpt: str = "",
    save_to: Path,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    out_width: int = 0,
    out_height: int = 0,
    steps: int = DEFAULT_STEPS,
    cfg: float = DEFAULT_CFG,
    seed: int = 0,
    sampler: str = DEFAULT_SAMPLER,
    scheduler: str = DEFAULT_SCHEDULER,
    clip_skip: int = DEFAULT_CLIP_SKIP,
    workflow: dict | None = None,
    base: str = "",
) -> tuple[str, str | None]:
    """生一張圖並存到 save_to。回 (檔名, None) 或 ("", 錯誤訊息)。

    workflow 給值 = 原樣送出(testword 想貼自訂 workflow 時用),此時
    positive/ckpt 等參數全部忽略——這是 plan-v4 §8.3「worker 不檢視、
    不修改回傳值」那條的實作。
    """
    note_comfy_url(base)
    base = base or comfy_url()
    async with lease("comfy"):
        # 自動挑的 checkpoint 撞到「沒有 CLIP」就把它記進黑名單,換下一個再試。
        # models/checkpoints 裡混著單件檔時,「取清單第一個」是一顆會重複踩的地雷。
        for _ in range(len(await checkpoints(base)) or 1):
            wf, err = workflow, None
            picked, auto = "", False
            if wf is None:
                picked, err, auto = await resolve_ckpt(ckpt, base)
                if err:
                    return "", err
                # seed 沒給就隨機:同一份 prompt 重按會出不同的臉,不會每次都同一張
                if int(seed) <= 0:
                    seed = random.randrange(1, 2**31 - 1)
                wf = build_workflow(
                    ckpt=picked, positive=positive, negative=negative or DEFAULT_NEGATIVE,
                    width=width, height=height,
                    out_width=out_width, out_height=out_height,
                    steps=steps, cfg=cfg, seed=seed,
                    sampler=sampler, scheduler=scheduler, clip_skip=clip_skip,
                    filename_prefix="yorozuya/" + save_to.stem,
                )
            err = await _one_run(base, wf, save_to)
            if err and auto and err.startswith(MISSING_ENCODER_TAG):
                _BAD_CKPTS.add(picked)
                print(f"[ComfyUI] {picked} 沒有文字編碼器,列入黑名單,換下一個", flush=True)
                continue
            if err:
                return "", err.replace(MISSING_ENCODER_TAG, "")
            return save_to.name, None
    return "", "沒有可用的 checkpoint"


async def _one_run(base: str, wf: dict, save_to: Path) -> str | None:
    """送一份 workflow、等它跑完、把圖收下來。回錯誤字串或 None。"""
    deadline = time.time() + COMFY_TIMEOUT
    client_id = f"yorozuya-{int(time.time() * 1000)}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=5)) as c:
            pid, err = await _submit(c, base, wf, client_id)
            if err:
                return err
            hist, err = await _wait_history(c, base, pid, deadline)
            if err:
                return err
            imgs = _images_of(hist)
            if not imgs:
                return "ComfyUI 跑完了但沒有輸出圖片(工作流缺 SaveImage?)"
            img = imgs[-1]
            r = await c.get(
                f"{base}/view",
                params={
                    "filename": img["filename"],
                    "subfolder": img.get("subfolder", ""),
                    "type": "output",
                },
            )
            r.raise_for_status()
            save_to.parent.mkdir(parents=True, exist_ok=True)
            save_to.write_bytes(r.content)
    except httpx.HTTPError as e:
        return f"ComfyUI 連線失敗({type(e).__name__}):{base}"
    return None
