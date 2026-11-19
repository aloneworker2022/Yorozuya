"""老婆還債偷看：圖生圖圖庫與三段式對話（旁白→男→她）。

圖庫在 assets/wifepay/gallery/＋index.json；產出在 assets/wifepay/out/。
對話模板在 assets/wifepay/dialog.json；劇本在 assets/wifepay/scripts.json（可存多種、開門隨機抽）。內容規則沿用 escort_lines：成年人、自願、不寫強迫／未成年。
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

# 舊預設：使用者若沒改過 dialog.json（內容等於這份），載入時遷到新預設。
OLD_DIALOG = {
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

# 上一版預設（2026-11-19 加長旁白時仍把整段寫成「從門外聽到的對話」）。使用者若沒改過，載入時遷到新預設。
PREV_DIALOG = {
    "system": (
        "你替成人戀愛模擬遊戲寫一段玩家從門外聽到的對話。"
        "場景：成年女性為了替丈夫（玩家）還債，自願去接客；玩家剛按了門，先聽到裡面的聲音。"
        "雙方都是成年人、你情我願，可以粗口、激烈、求饒式撒嬌（慢一點、輕一點、會壞掉），"
        "但絕對不要寫強迫、不同意、暴力、未成年或任何救命／報警類台詞。"
        "格式固定三行，只要這三行，不要編號、不要引號外的說明；旁白請寫成一行："
        "旁白：……（第三人稱；先寫他們正在做什麼，再寫妻子和男子各自的表情、態度、肢體語言；不要寫玩家）"
        "男：……（客人正在說的一句話）"
        "她：……（老婆的回應）"
        "繁體中文。旁白 60～120 字，必須比對白長，務必寫到兩人的表情與態度；男 ≤ 32 字，她 ≤ 36 字。"
    ),
    "user": (
        "體位：{pose_zh}。\n客人：{man_build_zh}，{who}。\n"
        "她是玩家的{stage_zh}，名叫{name}，現在在服務客人；偶爾會想到老公但不會說出名字。\n"
        "{extra}"
        "旁白要寫表情、態度、肢體，60～120 字。\n"
        "開始："
    ),
}

# 旁白要比對白長，寫動作＋兩人表情／態度／肢體；60～120 字。對白維持短句。
NAR_MIN, NAR_MAX = 60, 180
MAN_MAX, WIFE_MAX = 36, 40

DEFAULT_DIALOG = {
    "system": (
        "你在寫成人戀愛模擬遊戲裡從門縫看見的一幕場面與對白。"
        "只要輸出固定三行，不要編號、不要額外說明、不要把括號裡的提示詞抄進內容。"
        "旁白必須是第三人稱場面敘述：只寫房裡的妻子與客人正在做什麼，以及兩人各自的表情、態度、肢體語言。"
        "旁白禁止出現對白或引號裡的話，禁止寫玩家、丈夫、門外偷看的人，也不要用「你聽見／從門外傳來」這種說法。"
        "旁白寫成一行，60～120 字，必須比後面兩句對白長。"
        "男：客人正在說出口的一句話，只要那句話本身（≤32 字）。"
        "她：妻子正在說出口的一句話，只要那句話本身（≤36 字）。"
        "雙方都是成年人、你情我願，可以粗口、激烈、求饒式撒嬌（慢一點、輕一點、會壞掉），"
        "但絕對不要寫強迫、不同意、暴力、未成年或任何救命／報警類台詞。繁體中文。"
    ),
    "user": (
        "劇本：{script_name}\n"
        "這一幕的情境：{scenario}\n"
        "體位：{pose_zh}。\n客人：{man_build_zh}，{who}。\n"
        "她名叫{name}。對白裡她偶爾可以想到丈夫，但不要說出名字；旁白不要寫到玩家或開門的人。\n"
        "{extra}"
        "旁白要寫兩人的表情、態度、肢體，60～120 字，不要把男／她的台詞寫進旁白。\n"
        "輸出三行，格式如下：\n"
        "旁白：\n"
        "男：\n"
        "她：\n"
    ),
}

FALLBACKS = [
    {
        "narration": "暖黃燈下，她仰躺在凌亂的床單上，眉心微蹙、唇瓣微張，眼尾含著水光卻還是看著壓上來的男人；他額角沁著汗，眼神發亮、嘴角帶著得意，腰一下一下深深頂進去，床板跟著輕輕響。",
        "man": "夾這麼緊……錢花得真值。",
        "wife": "嗯……慢、慢一點……太深了……",
    },
    {
        "narration": "她跨坐在他大腿上自己起伏，臉頰潮紅、睫毛濕濕的，偶爾咬住下唇把呻吟壓低；男人仰躺著，一隻手捏著她的腰，表情又饞又滿意，不時往上頂，看她肩頭輕輕發抖。",
        "man": "對，再坐深一點，自己動啊。",
        "wife": "哈啊……進、進到最裡面了……",
    },
    {
        "narration": "她跪在床上被從後面撞著，手指緊抓著被單，側臉貼著枕頭，眉眼皺著卻沒有躲；身後的男人喘得低沉，掌心按在她腰上，動作又重又穩，每一下都讓她肩頭一顫。",
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


def scripts_path(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "scripts.json"


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


def _same_tpl(a: str, b: str) -> bool:
    return str(a or "").strip() == str(b or "").strip()


def load_dialog_prompt(assets: Path) -> dict:
    """讀對話模板。若檔案仍是舊預設（使用者沒改過），改寫成新預設；自訂內容不動。"""
    ensure_dirs(assets)
    p = dialog_path(assets)
    if p.is_file():
        try:
            data = json.loads(p.read_text("utf-8"))
            if isinstance(data, dict):
                system = _clip(data.get("system"), 4000) or DEFAULT_DIALOG["system"]
                user = _clip(data.get("user"), 4000) or DEFAULT_DIALOG["user"]
                changed = False
                if any(_same_tpl(system, d["system"]) for d in (OLD_DIALOG, PREV_DIALOG)):
                    system = DEFAULT_DIALOG["system"]
                    changed = True
                if any(_same_tpl(user, d["user"]) for d in (OLD_DIALOG, PREV_DIALOG)):
                    user = DEFAULT_DIALOG["user"]
                    changed = True
                row = {"system": system, "user": user}
                if changed:
                    _atomic_write(p, json.dumps(row, ensure_ascii=False, indent=2))
                return row
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



STOCK_SCRIPTS = [
    {
        "id": "sc_missionary",
        "name": "被壓在床上",
        "enabled": True,
        "tags": ["missionary"],
        "scenario": "體位是傳教士。她仰躺在床上，客人壓在她身上一下一下地動。旁白寫兩人的表情、態度與肢體，不要寫玩家。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "暖黃燈下，她仰躺在凌亂的床單上，眉心微蹙、唇瓣微張，眼尾含著水光卻還是看著壓上來的男人；他額角沁著汗，眼神發亮、嘴角帶著得意，腰一下一下深深頂進去，床板跟著輕輕響。",
            "man": "夾這麼緊……錢花得真值。",
            "wife": "嗯……慢、慢一點……太深了……",
        },
    },
    {
        "id": "sc_cowgirl",
        "name": "她自己動",
        "enabled": True,
        "tags": ["cowgirl"],
        "scenario": "體位是騎乘。她跨坐在客人腿上自己起伏。旁白寫兩人的表情、態度與肢體，不要寫玩家。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "她跨坐在他大腿上自己起伏，臉頰潮紅、睫毛濕濕的，偶爾咬住下唇把呻吟壓低；男人仰躺著，一隻手捏著她的腰，表情又饞又滿意，不時往上頂，看她肩頭輕輕發抖。",
            "man": "對，再坐深一點，自己動啊。",
            "wife": "哈啊……進、進到最裡面了……",
        },
    },
    {
        "id": "sc_doggy",
        "name": "從後面",
        "enabled": True,
        "tags": ["doggy"],
        "scenario": "體位是從後面。她跪在床上，客人在她身後。旁白寫兩人的表情、態度與肢體，不要寫玩家。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "她跪在床上被從後面撞著，手指緊抓著被單，側臉貼著枕頭，眉眼皺著卻沒有躲；身後的男人喘得低沉，掌心按在她腰上，動作又重又穩，每一下都讓她肩頭一顫。",
            "man": "屁股再翹高一點，這姿勢最深了吧。",
            "wife": "啊……從後面……好深……膝蓋好痠……",
        },
    },
    {
        "id": "sc_kiss",
        "name": "面對面擁吻",
        "enabled": True,
        "tags": ["kiss"],
        "scenario": "他們面對面坐著或抱著，一邊接吻一邊慢慢磨。旁白寫兩人的表情、態度與肢體，不要寫玩家。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "他們面對面坐著緊緊抱在一起，她閉著眼、耳根發燙，手指抓著他的背；男人吻得很深，手沿著她的腰慢慢磨，眼神裡帶著貪戀，呼吸都交纏在一塊。",
            "man": "舌頭伸出來……貼這麼緊，喜歡嗎？",
            "wife": "嗯……好近……這樣好害羞……",
        },
    },
    {
        "id": "sc_reverse",
        "name": "背向坐著",
        "enabled": True,
        "tags": ["reverse"],
        "scenario": "她背對著坐在客人身上，自己起伏，偶爾側過頭。旁白寫兩人的表情、態度與肢體，不要寫玩家。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "她背對著坐在他身上，雙手撐在他大腿上自己起伏，耳根發紅、側臉卻還是忍不住回看；男人從後面托著她的腰，下巴抵在她肩上，眼神發亮、氣息噴在她頸側，每一下都讓她腰軟。",
            "man": "回過頭來，讓我看你的臉。",
            "wife": "這樣……好深，不要突然頂……",
        },
    },
    {
        "id": "sc_foreplay",
        "name": "還在前戲",
        "enabled": True,
        "tags": ["kiss", "foreplay"],
        "scenario": "還沒進入正題，或剛開始。他們在床沿或枕頭上接吻、愛撫，節奏比較慢。旁白寫兩人的表情、態度與肢體，不要寫玩家。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "他們還坐在床沿接吻，她羞得眼睫低垂、手指卻抓緊他的衣襟不放；男人一邊慢慢吻她的頸側，一邊用手掌沿著她的腰往上撫，態度溫柔卻顯然已經很想要。",
            "man": "別急著躲，讓我再親一會兒。",
            "wife": "嗯……你手……太近了啦……",
        },
    },
    {
        "id": "sc_regular",
        "name": "常客熟路",
        "enabled": True,
        "tags": ["cowgirl", "missionary"],
        "scenario": "若是常客就寫得更熟門熟路；若是第一次來，就寫他很快找到她的節奏。兩人已經對上步調。旁白寫表情、態度與肢體，不要寫玩家。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "像是早就對上節奏那樣，她被他抱到床上後就跟著他的動作走，眼神裡有點無奈又帶著熱；男人一臉熟稔地吻她鎖骨，掌心按著她的腰，笑意裡帶著得意，動作卻不急著給夠。",
            "man": "還是這麼敏感，上次也是這樣。",
            "wife": "別、別說那個……專心一點……",
        },
    },
    {
        "id": "sc_intense",
        "name": "激烈求饒",
        "enabled": True,
        "tags": ["doggy", "missionary"],
        "scenario": "節奏比較激烈，她帶著求饒式的撒嬌（慢一點、輕一點），但雙方都是你情我願，沒有強迫。旁白寫兩人的表情、態度與肢體，不要寫玩家。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "她被頂得聲音都發顫，眉心皺緊、唇間漏出求饒似的氣音，手指死死抓著床單卻沒有推開他；男人喘得又重又急，額角是汗，眼神盯著她不放，一下比一下更深，卻還停在她受得住的邊。",
            "man": "再忍一下，很快就讓你緩。",
            "wife": "太、太快了……慢一點好不好……",
        },
    },
]


def _is_builtin_tpl(system: str, user: str) -> bool:
    """系統或使用者提示是否等於某一版內建預設（含舊版）。"""
    sys_hit = any(_same_tpl(system, d["system"]) for d in (OLD_DIALOG, PREV_DIALOG, DEFAULT_DIALOG))
    user_hit = any(_same_tpl(user, d["user"]) for d in (OLD_DIALOG, PREV_DIALOG, DEFAULT_DIALOG))
    return sys_hit and user_hit


def clean_fallback(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    nar = apply_banned(_clip(raw.get("narration"), NAR_MAX))
    man = apply_banned(_clip(raw.get("man"), MAN_MAX))
    wife = apply_banned(_clip(raw.get("wife"), WIFE_MAX))
    if not (nar and man and wife):
        return None
    if not (NAR_MIN <= len(nar) <= NAR_MAX):
        return None
    return {"narration": nar, "man": man, "wife": wife}


def clean_script(raw: dict, *, new_id: bool = False) -> dict | None:
    if not isinstance(raw, dict):
        return None
    sid = _clip(raw.get("id"), 40)
    if new_id or not re.fullmatch(r"[A-Za-z0-9_-]{2,40}", sid or ""):
        sid = "sc_" + uuid.uuid4().hex[:10]
    name = _clip(raw.get("name"), 40) or "未命名劇本"
    scenario = _clip(raw.get("scenario"), 2000)
    system = _clip(raw.get("system"), 4000)
    user = _clip(raw.get("user"), 4000)
    enabled = raw.get("enabled")
    if enabled is None:
        enabled = True
    fb = clean_fallback(raw.get("fallback")) if raw.get("fallback") is not None else None
    return {
        "id": sid,
        "name": name,
        "enabled": bool(enabled),
        "tags": clean_tags(raw.get("tags")),
        "scenario": scenario,
        "system": system,
        "user": user,
        "fallback": fb,
    }


def _seed_scripts(assets: Path) -> list[dict]:
    """第一次：內建 8 種劇本。若 dialog.json 是使用者改過的模板，放到第一筆並保留原文。"""
    scripts = [clean_script(x) for x in STOCK_SCRIPTS]
    scripts = [s for s in scripts if s]
    raw = None
    p = dialog_path(assets)
    if p.is_file():
        try:
            data = json.loads(p.read_text("utf-8"))
            if isinstance(data, dict):
                raw = {
                    "system": _clip(data.get("system"), 4000),
                    "user": _clip(data.get("user"), 4000),
                }
        except (OSError, json.JSONDecodeError):
            raw = None
    # 先讓內建舊模板遷到新預設（自訂的不動）
    load_dialog_prompt(assets)
    if raw and raw["system"] and raw["user"] and not _is_builtin_tpl(raw["system"], raw["user"]):
        custom = clean_script({
            "id": "sc_custom",
            "name": "自訂模板",
            "enabled": True,
            "tags": [],
            "scenario": "沿用你原本儲存的對話模板。",
            "system": raw["system"],
            "user": raw["user"],
            "fallback": STOCK_SCRIPTS[0]["fallback"],
        })
        if custom:
            scripts = [custom] + [s for s in scripts if s["id"] != "sc_custom"]
    return scripts


def load_scripts(assets: Path) -> list[dict]:
    ensure_dirs(assets)
    p = scripts_path(assets)
    if p.is_file():
        try:
            data = json.loads(p.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            data = None
        items = data if isinstance(data, list) else (data.get("scripts") if isinstance(data, dict) else None)
        if isinstance(items, list):
            out = []
            seen = set()
            for it in items:
                row = clean_script(it) if isinstance(it, dict) else None
                if not row or row["id"] in seen:
                    continue
                seen.add(row["id"])
                out.append(row)
            if out:
                return out
    scripts = _seed_scripts(assets)
    save_scripts(assets, scripts)
    return scripts


def save_scripts(assets: Path, scripts: list[dict]) -> list[dict]:
    ensure_dirs(assets)
    rows = []
    seen = set()
    for it in scripts or []:
        row = clean_script(it) if isinstance(it, dict) else None
        if not row or row["id"] in seen:
            continue
        seen.add(row["id"])
        rows.append(row)
    _atomic_write(scripts_path(assets), json.dumps({"scripts": rows}, ensure_ascii=False, indent=2))
    return rows


def get_script(assets: Path, script_id: str) -> dict | None:
    sid = str(script_id or "").strip()
    return next((s for s in load_scripts(assets) if s["id"] == sid), None)


def add_script(assets: Path, data: dict | None = None) -> dict:
    scripts = load_scripts(assets)
    row = clean_script(data or {"name": "新劇本", "scenario": ""}, new_id=True)
    if not row:
        row = clean_script({"name": "新劇本"}, new_id=True)
    scripts.append(row)
    save_scripts(assets, scripts)
    return row


def patch_script(assets: Path, script_id: str, fields: dict) -> dict | None:
    scripts = load_scripts(assets)
    hit = next((s for s in scripts if s["id"] == script_id), None)
    if not hit:
        return None
    if not isinstance(fields, dict):
        fields = {}
    merged = {**hit, **{k: fields[k] for k in fields if k != "id"}}
    merged["id"] = hit["id"]
    row = clean_script(merged)
    if not row:
        return None
    row["id"] = hit["id"]
    scripts = [row if s["id"] == hit["id"] else s for s in scripts]
    save_scripts(assets, scripts)
    return row


def delete_script(assets: Path, script_id: str) -> bool:
    scripts = load_scripts(assets)
    if not any(s["id"] == script_id for s in scripts):
        return False
    if len(scripts) <= 1:
        return False
    keep = [s for s in scripts if s["id"] != script_id]
    save_scripts(assets, keep)
    return True


def pick_script(scripts: list, tags=None, script_id: str | None = None, rnd=None) -> dict | None:
    """指定 id 就用那一筆（停用也可，方便測試）。否則從啟用的裡面抽；有 tags 時優先對上劇本 tags。"""
    rows = [s for s in (scripts or []) if isinstance(s, dict) and s.get("id")]
    if not rows:
        return None
    sid = str(script_id or "").strip()
    if sid and sid not in ("random", "*"):
        hit = next((s for s in rows if s["id"] == sid), None)
        if hit:
            return hit
    pool = [s for s in rows if s.get("enabled", True)] or rows
    tagset = set(clean_tags(tags) if tags is not None else [])
    prefer = [s for s in pool if tagset and tagset & set(s.get("tags") or [])]
    src = prefer or pool
    rng = rnd if hasattr(rnd, "randrange") else random.Random()
    return src[rng.randrange(len(src))]


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


def dialog_messages(info: dict, template: dict | None = None, script: dict | None = None) -> tuple[str, str]:
    """組系統／使用者提示。劇本可覆寫模板，並帶入 {scenario}、{script_name}。"""
    info = info or {}
    script = script if isinstance(script, dict) else {}
    tpl = template or DEFAULT_DIALOG
    v = persona_vars(info)
    extra = []
    if v.get("voice_zh"):
        extra.append(f"她的叫聲類型：{v['voice_zh']}")
    if v.get("family"):
        extra.append(f"她的個性：{v['family']}")
    scenario = str(script.get("scenario") or info.get("scenario") or "").strip()
    script_name = str(script.get("name") or info.get("script_name") or "").strip()
    v = {
        **v,
        "extra": (("\n".join(extra) + "\n") if extra else ""),
        "scenario": scenario,
        "script_name": script_name,
    }
    sys_tpl = str(script.get("system") or "").strip() or (tpl.get("system") or DEFAULT_DIALOG["system"])
    user_tpl = str(script.get("user") or "").strip() or (tpl.get("user") or DEFAULT_DIALOG["user"])
    system = expand(sys_tpl, v)
    user = expand(user_tpl, v)
    if not script_name:
        user = re.sub(r"^劇本：\s*\n", "", user)
    if not scenario:
        user = re.sub(r"這一幕的情境：\s*\n", "", user)
    # 自訂使用者模板若沒有 {scenario} 欄位，就把情境補在最前面，避免劇本沒被用到
    if scenario and "{scenario}" not in user_tpl:
        title = f"【劇本：{script_name}】\n" if script_name else ""
        user = f"{title}這一幕的情境：{scenario}\n{user}"
    return system, user


def parse_dialog(reply: str) -> dict | None:
    """解析旁白／男／她。旁白可跨行接在「旁白：」後面；長度要落在 NAR_MIN～NAR_MAX，否則當寫壞。"""
    nar = man = wife = ""
    cur = None
    for raw in str(reply or "").splitlines():
        m = _LINE_RE.match(raw)
        if m:
            side, text = m.group(1), apply_banned(m.group(2))
            if side in ("旁白", "敘述", "畫面"):
                cur, nar = "nar", text
            elif side in ("男", "客", "客人", "他"):
                cur, man = "man", text
            else:
                cur, wife = "wife", text
            continue
        extra = apply_banned(str(raw or "").strip())
        if extra and cur == "nar":
            nar = f"{nar}{extra}" if nar else extra
    if not (nar and man and wife):
        return None
    if _banned(nar) or _banned(man) or _banned(wife):
        return None
    if not (NAR_MIN <= len(nar) <= NAR_MAX):
        return None
    if len(man) > MAN_MAX or len(wife) > WIFE_MAX:
        return None
    return {"narration": nar, "man": man, "wife": wife}


def fallback_dialog(info: dict | None = None, rnd=None) -> dict:
    info = info or {}
    script = info.get("script") if isinstance(info.get("script"), dict) else None
    if script:
        row = clean_fallback(script.get("fallback"))
        if row:
            return dict(row)
    roll = rnd if callable(rnd) else (rnd.random if hasattr(rnd, "random") else random.random)
    pose = str(info.get("pose") or "")
    by_pose = {
        "missionary": FALLBACKS[0],
        "cowgirl": FALLBACKS[1],
        "doggy": FALLBACKS[2],
        "reverse": FALLBACKS[2],
        "kiss": {
            "narration": "他們面對面坐著緊緊抱在一起，她閉著眼、耳根發燙，手指抓著他的背；男人吻得很深，手沿著她的腰慢慢磨，眼神裡帶著貪戀，呼吸都交纏在一塊。",
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
