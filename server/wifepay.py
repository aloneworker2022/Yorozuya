"""老婆還債偷看：圖生圖圖庫與三段式對話（旁白→男→她）。

圖庫在 assets/wifepay/gallery/＋index.json；產出在 assets/wifepay/out/。
對話模板在 assets/wifepay/dialog.json。內容規則沿用 escort_lines：成年人、自願、不寫強迫／未成年。
"""
from __future__ import annotations

import json
import random
import re
import time
import uuid
from pathlib import Path

import escort_lines as EL

GALLERY_PREFIX = "/assets/wifepay/gallery/"
OUT_PREFIX = "/assets/wifepay/out/"
DEFAULT_DENOISE = 0.55
DENOISE_LO, DENOISE_HI = 0.35, 0.85
GEN_WIDTH, GEN_HEIGHT = 832, 1216
PROMPT_MAX = 4000
TAGS_MAX = 8
BANNED = EL.BANNED

DEFAULT_ITEM_PROMPT = (
    "1girl, 1boy, adult woman, adult man, hetero, {hair}, {breasts}, {body}, "
    "sex, {pose} pose, in bedroom, warm lamplight, from doorway, cinematic"
)
DEFAULT_NEGATIVE = (
    "child, loli, shota, underage, teen, young, forced, rape, violence, "
    "worst quality, blurry, deformed, extra limbs"
)

DEFAULT_DIALOG = {
    "system": (
        "你替成人戀愛模擬遊戲寫一段玩家從門外聽到的對話。"
        "場景：成年女性為了替丈夫（玩家）還債，自願去接客；玩家剛按了門，先聽到裡面的聲音。"
        "雙方都是成年人、你情我願，可以粗口、激烈、求饒式撒嬌（慢一點、輕一點、會壞掉），"
        "但絕對不要寫強迫、不同意、暴力、未成年或任何救命／報警類台詞。"
        "格式固定三行，只要這三行，不要編號、不要引號外的說明："
        "旁白：……（第三人稱描述老婆和客人正在做什麼，一句或兩句，不要寫玩家）"
        "男：……（客人正在說的一句話）"
        "她：……（老婆的回應）"
        "繁體中文。旁白 ≤ 40 字，男 ≤ 24 字，她 ≤ 28 字。"
    ),
    "user": (
        "體位：{pose_zh}。\n客人：{man_build_zh}，{who}。\n"
        "她是玩家的{stage_zh}，名叫{name}，現在在服務客人；偶爾會想到老公但不會說出名字。\n"
        "{extra}"
        "開始："
    ),
}

FALLBACKS = [
    {
        "narration": "門縫裡傳來肉體拍打的聲音，她被客人壓在床上一下一下地頂著。",
        "man": "夾這麼緊……錢花得真值。",
        "wife": "嗯……慢、慢一點……太深了……",
    },
    {
        "narration": "暖燈下她坐在客人大腿上自己動，喘息裡夾著壓抑的呻吟。",
        "man": "對，再坐深一點，自己動啊。",
        "wife": "哈啊……進、進到最裡面了……",
    },
    {
        "narration": "她跪在床上被從後面撞著，手指緊抓著被單，聲音一陣一陣洩出來。",
        "man": "屁股再翹高一點，這姿勢最深了吧。",
        "wife": "啊……從後面……好深……膝蓋好痠……",
    },
]

_VAR_RE = re.compile(r"\{([A-Za-z0-9_]+)\}")
_LINE_RE = re.compile(
    r"^\s*[-*\d.、)]*\s*(旁白|敘述|畫面|男|客人?|他|她|妻子?|老婆)\s*[:：]\s*(.+?)\s*$"
)


def gallery_dir(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "gallery"


def out_dir(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "out"


def index_path(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "index.json"


def dialog_path(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "dialog.json"


def ensure_dirs(assets: Path) -> None:
    gallery_dir(assets).mkdir(parents=True, exist_ok=True)
    out_dir(assets).mkdir(parents=True, exist_ok=True)
    (Path(assets) / "wifepay").mkdir(parents=True, exist_ok=True)


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def load_index(assets: Path) -> list[dict]:
    ensure_dirs(assets)
    p = index_path(assets)
    if not p.is_file():
        return []
    try:
        data = json.loads(p.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    items = data if isinstance(data, list) else data.get("items") if isinstance(data, dict) else []
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        cleaned = clean_item(it) if isinstance(it, dict) else None
        if cleaned:
            out.append(cleaned)
    return out


def save_index(assets: Path, items: list[dict]) -> None:
    ensure_dirs(assets)
    _atomic_write(index_path(assets), json.dumps(items, ensure_ascii=False, indent=2))


def clamp_denoise(v, default: float = DEFAULT_DENOISE) -> float:
    try:
        d = float(v)
    except (TypeError, ValueError):
        d = default
    if d <= 0:
        d = default
    return max(DENOISE_LO, min(DENOISE_HI, d))


def _clip(s, n: int) -> str:
    return str(s or "").strip()[:n]


def clean_tags(raw) -> list[str]:
    if isinstance(raw, str):
        raw = [x.strip() for x in raw.replace("，", ",").split(",")]
    if not isinstance(raw, list):
        return []
    out, seen = [], set()
    for t in raw:
        t = _clip(t, 24)
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
        if len(out) >= TAGS_MAX:
            break
    return out


def clean_item(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    iid = re.sub(r"[^A-Za-z0-9_-]", "", str(raw.get("id") or ""))[:20]
    if not iid:
        return None
    url = str(raw.get("url") or "").strip()
    name = str(raw.get("file") or raw.get("name") or "").strip()
    if not url:
        if name and Path(name).name == name and name.lower().endswith(".png"):
            url = f"{GALLERY_PREFIX}{name}"
        else:
            return None
    if not url.startswith(GALLERY_PREFIX) or ".." in url:
        return None
    file_name = Path(url).name
    if file_name != Path(file_name).name or not file_name.lower().endswith(".png"):
        return None
    return {
        "id": iid,
        "url": f"{GALLERY_PREFIX}{file_name}",
        "file": file_name,
        "prompt": _clip(raw.get("prompt"), PROMPT_MAX) or DEFAULT_ITEM_PROMPT,
        "negative": _clip(raw.get("negative"), PROMPT_MAX) or DEFAULT_NEGATIVE,
        "denoise": clamp_denoise(raw.get("denoise")),
        "tags": clean_tags(raw.get("tags")),
        "width": int(raw.get("width") or 0),
        "height": int(raw.get("height") or 0),
        "created": float(raw.get("created") or 0),
    }


def item_file(assets: Path, item: dict) -> Path:
    return gallery_dir(assets) / Path(item.get("file") or Path(str(item.get("url") or "")).name).name


def get_item(assets: Path, item_id: str) -> dict | None:
    want = re.sub(r"[^A-Za-z0-9_-]", "", str(item_id or ""))[:20]
    if not want:
        return None
    for it in load_index(assets):
        if it["id"] == want:
            return it
    return None


def add_item(assets: Path, png: bytes, *, width: int = 0, height: int = 0, prompt: str = "",
             negative: str = "", denoise=None, tags=None) -> dict:
    if not png:
        raise ValueError("空檔")
    ensure_dirs(assets)
    iid = "wp_" + uuid.uuid4().hex[:10]
    fname = f"{iid}.png"
    dest = gallery_dir(assets) / fname
    dest.write_bytes(png)
    item = clean_item({
        "id": iid,
        "url": f"{GALLERY_PREFIX}{fname}",
        "file": fname,
        "prompt": prompt or DEFAULT_ITEM_PROMPT,
        "negative": negative or DEFAULT_NEGATIVE,
        "denoise": denoise if denoise is not None else DEFAULT_DENOISE,
        "tags": tags or [],
        "width": width,
        "height": height,
        "created": time.time(),
    })
    items = load_index(assets)
    items.append(item)
    save_index(assets, items)
    return item


def patch_item(assets: Path, item_id: str, fields: dict) -> dict | None:
    items = load_index(assets)
    hit = next((x for x in items if x["id"] == item_id), None)
    if not hit:
        return None
    if "prompt" in fields:
        hit["prompt"] = _clip(fields.get("prompt"), PROMPT_MAX) or DEFAULT_ITEM_PROMPT
    if "negative" in fields:
        hit["negative"] = _clip(fields.get("negative"), PROMPT_MAX) or DEFAULT_NEGATIVE
    if "denoise" in fields and fields.get("denoise") is not None:
        hit["denoise"] = clamp_denoise(fields.get("denoise"))
    if "tags" in fields:
        hit["tags"] = clean_tags(fields.get("tags"))
    save_index(assets, items)
    return hit


def delete_item(assets: Path, item_id: str) -> bool:
    items = load_index(assets)
    hit = next((x for x in items if x["id"] == item_id), None)
    if not hit:
        return False
    keep = [x for x in items if x["id"] != item_id]
    save_index(assets, keep)
    p = item_file(assets, hit)
    if p.is_file():
        p.unlink()
    return True


def load_dialog_prompt(assets: Path) -> dict:
    ensure_dirs(assets)
    p = dialog_path(assets)
    if p.is_file():
        try:
            data = json.loads(p.read_text("utf-8"))
            if isinstance(data, dict):
                system = _clip(data.get("system"), 4000) or DEFAULT_DIALOG["system"]
                user = _clip(data.get("user"), 4000) or DEFAULT_DIALOG["user"]
                return {"system": system, "user": user}
        except (OSError, json.JSONDecodeError):
            pass
    return dict(DEFAULT_DIALOG)


def save_dialog_prompt(assets: Path, data: dict) -> dict:
    cur = load_dialog_prompt(assets)
    if not isinstance(data, dict):
        data = {}
    if str(data.get("system") or "").strip():
        cur["system"] = _clip(data.get("system"), 4000)
    if str(data.get("user") or "").strip():
        cur["user"] = _clip(data.get("user"), 4000)
    _atomic_write(dialog_path(assets), json.dumps(cur, ensure_ascii=False, indent=2))
    return cur


def _look_of(info: dict) -> dict:
    ch = info.get("character") if isinstance(info.get("character"), dict) else {}
    look = info.get("look") if isinstance(info.get("look"), dict) else None
    if look is None:
        look = ch.get("look") if isinstance(ch.get("look"), dict) else {}
    return look


def persona_vars(info: dict) -> dict:
    """展開 prompt 模板用的變數。沒有的鍵展開成空字串。"""
    info = info or {}
    ch = info.get("character") if isinstance(info.get("character"), dict) else {}
    look = _look_of(info)
    pose = str(info.get("pose") or "").strip()
    build = str(info.get("build") or info.get("man") or "average").strip() or "average"
    name = str(info.get("name") or ch.get("name") or "").strip() or "她"
    stage = str(info.get("stage") or ch.get("roomStage") or ch.get("stage") or "").strip()
    hair = str(look.get("hair") or look.get("hairStyle") or ch.get("hair") or "").strip()
    color = str(look.get("hairColor") or "").strip()
    if color and hair and color not in hair:
        hair = f"{color}{hair}"
    elif color and not hair:
        hair = color
    breasts = str(look.get("bust") or look.get("cup") or look.get("breasts") or ch.get("bust") or "").strip()
    body = str(look.get("body") or look.get("figure") or ch.get("body") or "").strip()
    regular = bool(info.get("regular"))
    gname = str(info.get("guestName") or info.get("guest") or "").strip()
    who = f"常客{gname}（她認得他）" if regular and gname else "第一次來的陌生客人"
    return {
        "name": name,
        "hair": hair,
        "breasts": breasts,
        "body": body,
        "skin": str(look.get("skin") or "").strip(),
        "pose": pose,
        "pose_zh": EL.POSE_ZH.get(pose, "做愛"),
        "man_build": build,
        "man_build_zh": EL.BUILD_ZH.get(build, "普通身材"),
        "family": str(info.get("family") or "").strip(),
        "voice": str(info.get("voice") or "").strip(),
        "voice_zh": EL.VOICE_ZH.get(str(info.get("voice") or ""), ""),
        "stage": stage,
        "stage_zh": EL.STAGE_ZH.get(stage.split("_")[0] if stage else "", "老婆") if stage else "老婆",
        "guest_name": gname,
        "who": who,
    }


def expand(text: str, variables: dict | None = None) -> str:
    variables = variables or {}

    def repl(m):
        return str(variables.get(m.group(1), "") or "")

    return _VAR_RE.sub(repl, str(text or ""))


def pick_count(rnd=None) -> int:
    roll = rnd if callable(rnd) else (rnd.random if hasattr(rnd, "random") else random.random)
    return 1 if float(roll()) < 0.5 else 2


def pick_items(items: list, pose: str = "", count: int | None = None, rnd=None) -> list:
    """隨機抽 1 或 2 張。有對上 pose 的 tags 時優先從那些抽；不夠再從全部抽。圖庫空就回空。"""
    pool = [x for x in (items or []) if isinstance(x, dict) and x.get("id") and x.get("url")]
    if not pool:
        return []
    rng = rnd if hasattr(rnd, "sample") else random.Random()
    n = int(count) if count in (1, 2) else pick_count(rng)
    n = min(n, len(pool))
    tagged = [x for x in pool if pose and pose in (x.get("tags") or [])]
    src = tagged if len(tagged) >= n else (tagged + [x for x in pool if x not in tagged])
    src = src[:len(pool)]
    if len(src) < n:
        src = pool
    if len(src) <= n:
        return list(src)
    return rng.sample(src, n)


def _banned(text: str) -> bool:
    t = str(text or "")
    return any(b in t for b in BANNED)


def apply_banned(text: str) -> str:
    t = str(text or "").strip().strip("「」\"'")
    return "" if (not t or _banned(t)) else t


def dialog_messages(info: dict, template: dict | None = None) -> tuple[str, str]:
    tpl = template or DEFAULT_DIALOG
    v = persona_vars(info)
    extra = []
    if v.get("voice_zh"):
        extra.append(f"她的叫聲類型：{v['voice_zh']}")
    if v.get("family"):
        extra.append(f"她的個性：{v['family']}")
    v = {**v, "extra": (("\n".join(extra) + "\n") if extra else "")}
    system = expand(tpl.get("system") or DEFAULT_DIALOG["system"], v)
    user = expand(tpl.get("user") or DEFAULT_DIALOG["user"], v)
    return system, user


def parse_dialog(reply: str) -> dict | None:
    nar = man = wife = ""
    for raw in str(reply or "").splitlines():
        m = _LINE_RE.match(raw)
        if not m:
            continue
        side, text = m.group(1), apply_banned(m.group(2))
        if not text:
            continue
        if side in ("旁白", "敘述", "畫面"):
            if len(text) > 48:
                continue
            nar = text
        elif side in ("男", "客", "客人", "他"):
            if len(text) > 28:
                continue
            man = text
        else:
            if len(text) > 32:
                continue
            wife = text
    if nar and man and wife:
        return {"narration": nar, "man": man, "wife": wife}
    return None


def fallback_dialog(info: dict | None = None, rnd=None) -> dict:
    roll = rnd if callable(rnd) else (rnd.random if hasattr(rnd, "random") else random.random)
    pose = str((info or {}).get("pose") or "")
    by_pose = {
        "missionary": FALLBACKS[0],
        "cowgirl": FALLBACKS[1],
        "doggy": FALLBACKS[2],
        "reverse": FALLBACKS[2],
        "kiss": {
            "narration": "他們面對面坐著抱在一起，一邊接吻一邊慢慢磨著。",
            "man": "舌頭伸出來……貼這麼緊，喜歡嗎？",
            "wife": "嗯……好近……這樣好害羞……",
        },
    }
    row = by_pose.get(pose) or FALLBACKS[int(float(roll()) * len(FALLBACKS)) % len(FALLBACKS)]
    return dict(row)


def resolve_dialog(reply: str, info: dict | None = None) -> tuple[dict, bool]:
    """回 (三段, 是否模型寫的)。寫壞或觸礁 → 本地後備。"""
    parsed = parse_dialog(reply)
    if parsed:
        return parsed, True
    return fallback_dialog(info), False
