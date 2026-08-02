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

COMFY_URL = os.environ.get("COMFY_URL", "http://localhost:8188").rstrip("/")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
# 一張圖從送出到收檔的上限。含換班重載 checkpoint 的時間。
COMFY_TIMEOUT = float(os.environ.get("COMFY_TIMEOUT", "300"))
# 預設 checkpoint;留空 = 開機時問 ComfyUI 有哪些,取第一個
COMFY_CKPT = os.environ.get("COMFY_CKPT", "").strip()

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
# 手機在設定頁填的 Ollama 位址會蓋掉環境變數預設值:聊天走哪個端點,
# 就對哪個端點下卸載指令,免得仲裁對著一台沒人用的 Ollama 空揮。
_ollama_seen: str = ""


def note_ollama_endpoint(endpoint: str) -> None:
    """記下實際在用的 Ollama 位址(由聊天路徑回報)。"""
    global _ollama_seen
    ep = (endpoint or "").strip().rstrip("/")
    if ep and ep not in ("grok-build", "grok-img", "grok", "xai"):
        _ollama_seen = ep


def ollama_url() -> str:
    return _ollama_seen or OLLAMA_URL


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
                f"{COMFY_URL}/free",
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
        "comfy_url": COMFY_URL,
    }


# ------------------------------------------------------------ ComfyUI 查詢


async def system_stats() -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            return (await c.get(f"{COMFY_URL}/system_stats")).json()
    except Exception:  # noqa: BLE001
        return None


async def checkpoints() -> list[str]:
    """問 ComfyUI 現在有哪些 checkpoint —— 不在 RP5 這邊寫死清單。"""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            info = (await c.get(f"{COMFY_URL}/object_info/CheckpointLoaderSimple")).json()
        opts = info["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
        return [str(x) for x in opts]
    except Exception:  # noqa: BLE001
        return []


async def resolve_ckpt(want: str = "") -> tuple[str, str | None]:
    """把使用者給的 checkpoint 名對到實際存在的檔名。
    給空的 → 用 COMFY_CKPT,再空 → 取 ComfyUI 清單第一個。"""
    avail = await checkpoints()
    if not avail:
        return "", "ComfyUI 連不上,或 models/checkpoints 是空的"
    for cand in (want.strip(), COMFY_CKPT):
        if not cand:
            continue
        if cand in avail:
            return cand, None
        # 只給了不含副檔名/資料夾的片段也接受
        hit = [a for a in avail if cand.lower() in a.lower()]
        if hit:
            return hit[0], None
    return avail[0], None


# ------------------------------------------------------- workflow builder
# 這裡就是 plan-v4 §8.3 說的「廠商替換點」:回傳 ComfyUI /prompt 吃的 API 格式
# workflow。之後要換模型、加 LoRA、加色彩量化,改這一個函式就好,worker 不看內容。


def build_workflow(
    *,
    ckpt: str,
    positive: str,
    negative: str = "",
    width: int = 512,
    height: int = 768,
    out_width: int = 0,
    out_height: int = 0,
    steps: int = 25,
    cfg: float = 7.0,
    sampler: str = "dpmpp_2m",
    scheduler: str = "karras",
    seed: int = 0,
    filename_prefix: str = "yorozuya/img",
) -> dict:
    """8 節點 txt2img。out_width/out_height 給值 = 生完再縮到那個尺寸。

    高解析生 → 縮小,是刻意的:SD 在 512(1.5)/1024(XL)解析度訓練,
    直接叫它畫 192 寬會出一坨爛泥。縮圖用 nearest-exact 不做平滑內插,
    邊緣保持硬的才有像素風顆粒感(plan-v4 §立繪 192×288)。
    """
    wf: dict = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": ckpt},
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": ["1", 1]},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["1", 1]},
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


async def _submit(client: httpx.AsyncClient, wf: dict, client_id: str) -> tuple[str, str | None]:
    r = await client.post(f"{COMFY_URL}/prompt", json={"prompt": wf, "client_id": client_id})
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


async def _wait_history(client: httpx.AsyncClient, pid: str, deadline: float) -> tuple[dict, str | None]:
    """輪詢 /history 直到這張圖跑完。ComfyUI 沒有「完成」推播給 HTTP 客戶端,
    要嘛開 websocket 要嘛輪詢;輪詢少一個連線狀態要顧,這裡夠用。"""
    while time.time() < deadline:
        r = await client.get(f"{COMFY_URL}/history/{pid}")
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


def _explain_error(status: dict) -> str:
    for kind, payload in status.get("messages") or []:
        if kind == "execution_error" and isinstance(payload, dict):
            node = payload.get("node_type") or payload.get("node_id")
            return f"{node}: {payload.get('exception_message') or payload.get('exception_type')}"[:600]
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
    width: int = 512,
    height: int = 768,
    out_width: int = 0,
    out_height: int = 0,
    steps: int = 25,
    cfg: float = 7.0,
    seed: int = 0,
    sampler: str = "dpmpp_2m",
    scheduler: str = "karras",
    workflow: dict | None = None,
) -> tuple[str, str | None]:
    """生一張圖並存到 save_to。回 (檔名, None) 或 ("", 錯誤訊息)。

    workflow 給值 = 原樣送出(testword 想貼自訂 workflow 時用),此時
    positive/ckpt 等參數全部忽略——這是 plan-v4 §8.3「worker 不檢視、
    不修改回傳值」那條的實作。
    """
    async with lease("comfy"):
        if workflow is None:
            ckpt, err = await resolve_ckpt(ckpt)
            if err:
                return "", err
            # seed 沒給就隨機:同一份 prompt 重按會出不同的臉,不會每次都同一張
            if int(seed) <= 0:
                seed = random.randrange(1, 2**31 - 1)
            workflow = build_workflow(
                ckpt=ckpt, positive=positive, negative=negative or DEFAULT_NEGATIVE,
                width=width, height=height,
                out_width=out_width, out_height=out_height,
                steps=steps, cfg=cfg, seed=seed,
                sampler=sampler, scheduler=scheduler,
                filename_prefix="yorozuya/" + save_to.stem,
            )
        deadline = time.time() + COMFY_TIMEOUT
        client_id = f"yorozuya-{int(time.time() * 1000)}"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=5)) as c:
                pid, err = await _submit(c, workflow, client_id)
                if err:
                    return "", err
                hist, err = await _wait_history(c, pid, deadline)
                if err:
                    return "", err
                imgs = _images_of(hist)
                if not imgs:
                    return "", "ComfyUI 跑完了但沒有輸出圖片(工作流缺 SaveImage?)"
                img = imgs[-1]
                r = await c.get(
                    f"{COMFY_URL}/view",
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
            return "", f"ComfyUI 連線失敗({type(e).__name__}):{COMFY_URL}"
    return save_to.name, None
