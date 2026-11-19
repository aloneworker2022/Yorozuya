"""老婆還債偷看：圖生圖圖庫與三段式對話（旁白→男→她）。

圖庫在 assets/wifepay/gallery/＋index.json；產出在 assets/wifepay/out/。同一姿勢可存很多張底圖（有該姿勢 tag＝選用）。開門時從該姿勢已選的裡面隨機抽 1 或 2 張（各半；只選 1 張就固定 1 張），不會從其他姿勢補張。
對話模板在 assets/wifepay/dialog.json；劇本存在 assets/wifepay/scripts.json（可存多種、開門隨機抽）。設定（打字速度、自訂姿勢、預設正面／負面提示詞、隔門聽不清）在 assets/wifepay/config.json，缺檔時用程式預設。
assets/wifepay/ 整個目錄被 gitignore，內建劇本以 STOCK_SCRIPTS 寫在程式裡，缺檔或舊檔缺少新 id 時由程式補上，不依賴倉庫裡的 json。內容規則沿用 escort_lines：成年人、自願、不寫強迫／未成年。
"""
from __future__ import annotations

import json
import random
import re
import time
import uuid
from pathlib import Path
from urllib.parse import unquote, urlparse

import escort_lines as EL

GALLERY_PREFIX = "/assets/wifepay/gallery/"
OUT_PREFIX = "/assets/wifepay/out/"
DEFAULT_DENOISE = 0.55
DENOISE_LO, DENOISE_HI = 0.35, 0.85
CHAR_SEC_DEFAULT = 0.6
CHAR_SEC_LEGACY = (1.2, 0.9)
CHAR_SEC_LO, CHAR_SEC_HI = 0.05, 2.0
# 舊版打字間隔（毫秒）當比例：一般 26、逗號 50、句號 90
_TYPE_BASE_MS, _TYPE_COMMA_MS, _TYPE_PERIOD_MS = 26, 50, 90
STOCK_POSES = (
    {"id": "missionary", "name": "傳教士"},
    {"id": "cowgirl", "name": "騎乘"},
    {"id": "doggy", "name": "老漢推車"},
    {"id": "kiss", "name": "擁吻"},
    {"id": "reverse", "name": "背向"},
)
PEEK_FRACS = ("1/2", "3/5")
GEN_WIDTH, GEN_HEIGHT = 832, 1216
PROMPT_MAX = 4000
TAGS_MAX = 8
PICK_MAX = 2  # 使用時一次隨機抽最多 2 張，不是圖庫上限
BANNED = EL.BANNED

DEFAULT_ITEM_PROMPT = (
    "1girl, 1boy, adult woman, adult man, hetero, {hair}, {breasts}, {body}, "
    "sex, {pose} pose, in bedroom, warm lamplight, from doorway, cinematic"
)
DEFAULT_NEGATIVE = (
    "child, loli, shota, underage, teen, young, forced, rape, violence, "
    "worst quality, blurry, deformed, extra limbs"
)
# 每張圖都會套用的廣角／雙人構圖；負面擋第一人稱與單人特寫。18+ 安全負向仍走 DEFAULT_NEGATIVE。
# 視線：正向看著男子，負向擋看鏡頭／viewer（舊預設見 PREV_GLOBAL_*，載入時補上缺的新標籤）。
PREV_GLOBAL_POS_DEFAULT = (
    "wide angle, wide shot, full body, two people, 1girl, 1boy, both visible, third-person view"
)
PREV_GLOBAL_NEG_DEFAULT = "pov, first-person view, male pov, close-up, cropped, out of frame, solo"
LOOK_POS_TAGS = ("looking at another", "looking at the man", "eye contact with man")
LOOK_NEG_TAGS = ("looking at viewer", "looking at camera", "eye contact with viewer")
GLOBAL_POS_DEFAULT = PREV_GLOBAL_POS_DEFAULT + ", " + ", ".join(LOOK_POS_TAGS)
GLOBAL_NEG_DEFAULT = PREV_GLOBAL_NEG_DEFAULT + ", " + ", ".join(LOOK_NEG_TAGS)
# 已寫入檔案的設定只在這版還沒遷過時補視線標籤；之後使用者若拿掉就不再塞回去。
GAZE_PROMPT_VER = 1

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
MAN_MAX, WIFE_MAX = 40, 48

# 改預設提示（加入吟叫／斷續）前的那一版；使用者若沒改過，載入時遷到新預設。
PREV2_DIALOG = {
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

DEFAULT_DIALOG = {
    "system": (
        "你在寫成人戀愛模擬遊戲裡從門縫看見的一幕場面與對白。"
        "只要輸出固定三行，不要編號、不要額外說明、不要把括號裡的提示詞抄進內容。"
        "旁白必須是第三人稱場面敘述：只寫房裡的妻子與客人正在做什麼，以及兩人各自的表情、態度、肢體語言。"
        "旁白禁止出現對白或引號裡的話，禁止寫玩家、丈夫、門外偷看的人，也不要用「你聽見／從門外傳來」這種說法。"
        "旁白寫成一行，60～120 字，必須比後面兩句對白長。"
        "男：客人正在說出口的一句話，可以帶短促的喘息（嗯、哈），只要那句話本身（≤40 字）。"
        "她：妻子正在說出口的一句話，要自然帶吟叫聲與斷續（話會被頂斷，夾著「啊…」「嗯…」「哈啊」），只要那句話本身（≤48 字）。"
        "對白寫的是他們嘴裡實際說出的話，不要寫成門外聽不清楚的隻字片語。"
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
        "她的對白要帶自然的吟叫與斷續；男的對白可以有短促的嗯、哈。\n"
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
        "man": "嗯，對，再坐深一點，自己動啊。",
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


DISPLAY_MAX_EDGE = 1216
DISPLAY_QUALITY = 85
DISPLAY_PREFIX = "/assets/wifepay/display/"


def display_dir(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "display"


def index_path(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "index.json"


def dialog_path(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "dialog.json"


def scripts_path(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "scripts.json"


def config_path(assets: Path) -> Path:
    return Path(assets) / "wifepay" / "config.json"


def ensure_dirs(assets: Path) -> None:
    gallery_dir(assets).mkdir(parents=True, exist_ok=True)
    out_dir(assets).mkdir(parents=True, exist_ok=True)
    display_dir(assets).mkdir(parents=True, exist_ok=True)
    (Path(assets) / "wifepay").mkdir(parents=True, exist_ok=True)




def resolve_display_src(assets: Path, raw_url: str) -> Path | None:
    """只允許 wifepay 圖庫或產出目錄裡的檔，擋路徑穿越。"""
    u = unquote(str(raw_url or "").strip())
    if not u:
        return None
    if "://" in u:
        try:
            u = urlparse(u).path or ""
        except Exception:
            return None
    u = u.split("?", 1)[0].split("#", 1)[0]
    if u.startswith("/assets/wifepay/gallery/"):
        root, rel = gallery_dir(assets), u[len("/assets/wifepay/gallery/"):]
    elif u.startswith("/assets/wifepay/out/"):
        root, rel = out_dir(assets), u[len("/assets/wifepay/out/"):]
    else:
        return None
    if not rel or Path(rel).is_absolute() or ".." in Path(rel).parts:
        return None
    try:
        root_r = root.resolve()
        p = (root / rel).resolve()
        p.relative_to(root_r)
    except (OSError, ValueError):
        return None
    if not p.is_file():
        return None
    return p


def display_file(assets: Path, src: Path) -> Path:
    """長邊最多 1216 的 JPEG（quality≈85），快取在 assets/wifepay/display/。"""
    from PIL import Image

    src = Path(src)
    ensure_dirs(assets)
    dest_dir = display_dir(assets)
    st = src.stat()
    name = f"{src.stem}-{st.st_mtime_ns}-{st.st_size}-e{DISPLAY_MAX_EDGE}q{DISPLAY_QUALITY}.jpg"
    dest = dest_dir / name
    if dest.is_file() and dest.stat().st_size > 0:
        return dest
    with Image.open(src) as im:
        im.load()
        if im.mode != "RGB":
            im = im.convert("RGB")
        w, h = im.size
        long = max(w, h)
        if long > DISPLAY_MAX_EDGE:
            scale = DISPLAY_MAX_EDGE / long
            im = im.resize((max(1, int(round(w * scale))), max(1, int(round(h * scale)))), Image.Resampling.LANCZOS)
        tmp = dest.with_suffix(".tmp.jpg")
        im.save(tmp, format="JPEG", quality=DISPLAY_QUALITY, optimize=True, progressive=True)
        tmp.replace(dest)
    return dest

def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def load_index(assets: Path, *, trim: bool = False) -> list[dict]:
    """讀圖庫。不再依姿勢張數修剪（trim 參數只為相容舊呼叫，忽略）。"""
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


def pose_ids_of(assets: Path | None = None, extra=None) -> set[str]:
    """內建姿勢＋設定裡新增的。不含一般 tag（例如 bed）。"""
    ids = {str(p["id"]) for p in STOCK_POSES}
    if assets is not None:
        ids.update(str(x) for x in (load_config(assets).get("poses") or []) if x)
    if extra:
        for x in extra:
            s = str(x or "").strip()
            if s:
                ids.add(s)
    return ids


def items_for_pose(items: list, pose: str) -> list[dict]:
    pose = str(pose or "").strip()
    if not pose:
        return []
    return [
        x for x in (items or [])
        if isinstance(x, dict) and x.get("id") and x.get("url") and pose in (x.get("tags") or [])
    ]


def load_gallery(assets: Path) -> dict:
    """讀圖庫。同一姿勢可有任意張已選底圖，不再修剪。"""
    return {"items": load_index(assets)}


def clamp_denoise(v, default: float = DEFAULT_DENOISE) -> float:
    try:
        d = float(v)
    except (TypeError, ValueError):
        d = default
    if d <= 0:
        d = default
    return max(DENOISE_LO, min(DENOISE_HI, d))


def clamp_char_sec(v, default: float = CHAR_SEC_DEFAULT) -> float:
    try:
        d = float(v)
    except (TypeError, ValueError):
        d = default
    if d <= 0:
        d = default
    return max(CHAR_SEC_LO, min(CHAR_SEC_HI, d))


def type_delay_ms(ch, char_sec: float = CHAR_SEC_DEFAULT) -> int:
    """單字等待毫秒。標點按舊版 26／50／90 的比例放大。"""
    base = int(round(clamp_char_sec(char_sec) * 1000))
    mark = str(ch or "")[:1]
    if re.search(r"[。！？!?…]", mark):
        return int(round(base * (_TYPE_PERIOD_MS / _TYPE_BASE_MS)))
    if re.search(r"[、，,．.]", mark):
        return int(round(base * (_TYPE_COMMA_MS / _TYPE_BASE_MS)))
    return base


# --- 隔門聽不清：隻字片語／吟叫穿插（與 web/content/wifepay_heard.js 同一套規則）---
_HEAR_ELLIPSIS_CHARS = set("…⋯.")
_HEAR_PUNCT_CHARS = set("、，。！？!?~～・·「」『』【】（）()—─－-．,")
_HEAR_PARTICLES = set("的了嗎呢吧啊嗯哈喔哦噢唉阿痾唔呀嘛啦咯呵喲欸")
_HEAR_FUNC = {
    "怎麼", "什麼", "那個", "這個", "就是", "還是", "然後", "因為", "所以",
    "但是", "而且", "的話", "一下", "這樣", "那樣", "這麼", "那麼", "有點",
    "不是", "沒有", "已經", "還要", "一個", "一些", "一樣",
}
_HEAR_KEY_BITS = (
    "射", "進", "出", "深", "慢", "快", "爽", "愛", "要", "給", "夾", "頂", "插",
    "吻", "舔", "摸", "碰", "滿", "壞", "去", "來", "可以", "不行", "不要",
    "裡面", "後面", "前面", "舒服", "喜歡", "坐", "動", "翹", "高", "緊", "值",
    "近", "羞", "跪", "痠", "腰", "抱", "停", "黏", "錢", "舌", "嘴", "再", "點",
    "幹", "濕", "熱", "硬", "大",
)
_HEAR_LEXICON = (
    "射進去", "慢一點", "快一點", "坐深一點", "最裡面", "從後面",
    "再近一點", "不要停", "好害羞", "好舒服", "好喜歡", "進到", "太深了",
    "不可以", "怎麼了", "射進來", "自己動", "深一點", "翹高一點", "有點愛上",
    "愛上了", "這麼黏", "伸出來", "貼這麼緊", "喜歡嗎", "膝蓋好痠",
    "怎麼", "可以", "射進", "進去", "進來", "出來", "不要", "不行", "一點",
    "裡面", "後面", "前面", "好爽", "好深", "好滿", "好近", "舒服", "喜歡",
    "自己", "愛上", "這麼", "那麼", "這樣", "那樣", "舌頭", "太深", "太快",
    "慢慢", "害羞", "膝蓋", "好痠", "姿勢", "最深", "真值", "再坐", "再近",
    "不要停", "有點", "太深了", "慢一點", "快一點",
)
WIFE_MOANS = ("啊…", "嗯…", "哈啊", "痾…", "痾痾", "好爽…", "嗯啊", "啊啊", "唔…", "哈…", "啊")
MAN_MOANS = ("嗯", "哈", "呼…", "呃", "嗯…")
WIFE_TAILS = ("啊…", "嗯…", "好爽…", "哈啊…")
MAN_TAILS = ("嗯…", "哈…")
_HEAR_LEVELS = {
    "light": dict(clear=0.22, a=0.34, b=0.28, ab=0.16, drop=0.45, keyKeep=0.85,
                  moanGap=0.28, moanBreak=0.12, moanTail=0.28, moanMax=2),
    "mid": dict(clear=0.12, a=0.30, b=0.30, ab=0.28, drop=0.62, keyKeep=0.70,
                moanGap=0.45, moanBreak=0.28, moanTail=0.45, moanMax=3),
    "heavy": dict(clear=0.05, a=0.26, b=0.28, ab=0.41, drop=0.78, keyKeep=0.55,
                  moanGap=0.65, moanBreak=0.45, moanTail=0.70, moanMax=4),
}
_HEAR_LEX_SORTED = tuple(sorted(set(_HEAR_LEXICON), key=lambda w: (-len(w), w)))
MUFFLE_DEFAULT = True
MUFFLE_LEVEL_DEFAULT = "mid"
MUFFLE_LEVELS = ("light", "mid", "heavy")
_MOAN_SET = set(WIFE_MOANS) | set(MAN_MOANS) | set(WIFE_TAILS) | set(MAN_TAILS)


def normalize_muffle_level(v) -> str:
    s = str(v or "").strip().lower()
    if s in ("light", "輕", "lo", "low", "1"):
        return "light"
    if s in ("heavy", "重", "hi", "high", "3"):
        return "heavy"
    return "mid"


def parse_muffle_enabled(v, default: bool = True) -> bool:
    if v is None or v == "":
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in ("0", "false", "off", "no", "否", "關"):
        return False
    if s in ("1", "true", "on", "yes", "是", "開"):
        return True
    return default


def fnv1a(text: str) -> int:
    h = 2166136261
    for b in str(text or "").encode("utf-8"):
        h ^= b
        h = (h * 16777619) & 0xFFFFFFFF
    return h or 1


class HearRng:
    def __init__(self, seed: int):
        self.s = int(seed) & 0xFFFFFFFF
        if not self.s:
            self.s = 0x9E3779B9

    def next(self) -> float:
        self.s = (1664525 * self.s + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0

    def randint(self, n: int) -> int:
        if n <= 1:
            return 0
        return int(self.next() * n) % n

    def chance(self, p: float) -> bool:
        return self.next() < p

    def pick(self, items):
        return items[self.randint(len(items))]


def _is_cjk(ch: str) -> bool:
    o = ord(ch)
    return (0x3400 <= o <= 0x9FFF) or (0xF900 <= o <= 0xFAFF)


def tokenize_heard(text: str) -> list[str]:
    s = str(text or "")
    out: list[str] = []
    i, n = 0, len(s)
    while i < n:
        ch = s[i]
        if ch.isspace():
            j = i + 1
            while j < n and s[j].isspace():
                j += 1
            out.append(s[i:j])
            i = j
            continue
        if ch in _HEAR_ELLIPSIS_CHARS or ch in _HEAR_PUNCT_CHARS:
            j = i + 1
            while j < n and (s[j] in _HEAR_ELLIPSIS_CHARS or s[j] in _HEAR_PUNCT_CHARS):
                j += 1
            out.append(s[i:j])
            i = j
            continue
        if _is_cjk(ch):
            hit = ""
            for w in _HEAR_LEX_SORTED:
                if s.startswith(w, i):
                    hit = w
                    break
            if hit:
                out.append(hit)
                i += len(hit)
                continue
            out.append(ch)
            i += 1
            continue
        j = i + 1
        while (
            j < n
            and (not s[j].isspace())
            and s[j] not in _HEAR_ELLIPSIS_CHARS
            and s[j] not in _HEAR_PUNCT_CHARS
            and not _is_cjk(s[j])
        ):
            j += 1
        out.append(s[i:j])
        i = j
    return out


def _is_ellipsis_tok(tok: str) -> bool:
    return bool(re.fullmatch(r"[.…⋯\s]+", tok or "") and re.search(r"[.…⋯]", tok or ""))


def _is_punct_tok(tok: str) -> bool:
    if not tok:
        return True
    if tok.isspace():
        return True
    return all(c in _HEAR_ELLIPSIS_CHARS or c in _HEAR_PUNCT_CHARS or c.isspace() for c in tok)


def _is_content_tok(tok: str) -> bool:
    return bool(tok) and not _is_punct_tok(tok)


def _is_key_tok(tok: str) -> bool:
    if not _is_content_tok(tok) or _is_ellipsis_tok(tok):
        return False
    if tok in _HEAR_FUNC or (len(tok) == 1 and tok in _HEAR_PARTICLES):
        return False
    if any(b in tok for b in _HEAR_KEY_BITS):
        return True
    return len(tok) >= 2 and not all(c in _HEAR_PARTICLES for c in tok)


def _pick_mode(rng: HearRng, level: str, side: str) -> str:
    L = _HEAR_LEVELS.get(level) or _HEAR_LEVELS["mid"]
    clear, a, b = L["clear"], L["a"], L["b"]
    if side == "man":
        a += 0.08
        b -= 0.04
    x = rng.next()
    if x < clear:
        return "clear"
    if x < clear + a:
        return "a"
    if x < clear + a + b:
        return "b"
    return "ab"


def _ellipsis_mark(rng: HearRng) -> tuple[str, str, str]:
    mark = rng.pick(("……", "...", "...."))
    left = " " if rng.chance(0.6) else ""
    right = " " if rng.chance(0.5) else ""
    return mark, left, right


def _apply_a(tokens: list[str], rng: HearRng, L: dict) -> dict:
    decisions = [{"tok": tok, "keep": tok} for tok in tokens]
    first_content = next((i for i, tok in enumerate(tokens) if _is_content_tok(tok)), -1)

    for i, tok in enumerate(tokens):
        if not _is_content_tok(tok):
            decisions[i]["keep"] = tok if rng.chance(0.7) else ""
            continue
        key = _is_key_tok(tok)
        if i == first_content:
            if key and (len(tok) <= 2 or rng.chance(L["keyKeep"])):
                decisions[i]["keep"] = tok
            else:
                n = 2 if (rng.chance(0.45) and len(tok) >= 2) else 1
                decisions[i]["keep"] = tok[: max(1, n)]
            continue
        if key:
            if rng.chance(L["keyKeep"]):
                decisions[i]["keep"] = tok
            elif len(tok) >= 2 and rng.chance(0.7):
                n = 2 if (len(tok) >= 3 and rng.chance(0.5)) else 1
                decisions[i]["keep"] = tok[:n]
            else:
                decisions[i]["keep"] = ""
        elif rng.chance(L["drop"]):
            decisions[i]["keep"] = ""
        else:
            decisions[i]["keep"] = tok

    def restore(idx: int) -> None:
        tok = tokens[idx]
        if not _is_content_tok(tok):
            return
        if len(tok) >= 2 and _is_key_tok(tok) and rng.chance(0.4):
            decisions[idx]["keep"] = tok[: 2 if len(tok) >= 3 else 1]
        else:
            decisions[idx]["keep"] = tok

    def fragments_of() -> list[str]:
        return [d["keep"] for d in decisions if _is_content_tok(d["keep"])]

    frags = fragments_of()
    if len(frags) < 2:
        keys = [i for i, tok in enumerate(tokens) if _is_key_tok(tok) and not _is_content_tok(decisions[i]["keep"])]
        for i in keys:
            if len(fragments_of()) >= 2:
                break
            restore(i)
    frags = fragments_of()
    if len(frags) < 2:
        for i in range(len(tokens) - 1, -1, -1):
            if len(fragments_of()) >= 2:
                break
            if _is_content_tok(tokens[i]) and not _is_content_tok(decisions[i]["keep"]):
                restore(i)
    frags = fragments_of()
    if len(frags) < 2 and first_content >= 0:
        last_c = next((i for i in range(len(tokens) - 1, -1, -1) if _is_content_tok(tokens[i])), -1)
        if last_c > first_content:
            decisions[first_content]["keep"] = decisions[first_content]["keep"] or tokens[first_content][:1]
            tok = tokens[last_c]
            decisions[last_c]["keep"] = tok[:2] if len(tok) >= 2 else tok
    frags = fragments_of()

    parts: list[str] = []
    pending = False

    def push_ellipsis() -> None:
        mark, left, right = _ellipsis_mark(rng)
        prev = parts[-1] if parts else ""
        parts.append((left if prev and left else "") + mark + right)

    for d in decisions:
        if not d["keep"]:
            if _is_content_tok(d["tok"]) or _is_ellipsis_tok(d["tok"]):
                pending = True
            continue
        if pending and _is_content_tok(d["keep"]):
            push_ellipsis()
            pending = False
        if d["keep"].isspace() and pending:
            continue
        parts.append(d["keep"])
    if pending and any(_is_content_tok(x) for x in parts):
        push_ellipsis()
    text = re.sub(r"[ \t]+", " ", "".join(parts)).strip()
    return {"text": text, "fragments": fragments_of()}


def _apply_b(text: str, rng: HearRng, L: dict, side: str) -> str:
    tokens = tokenize_heard(text)
    if not tokens:
        return text
    moans = MAN_MOANS if side == "man" else WIFE_MOANS
    tails = MAN_TAILS if side == "man" else WIFE_TAILS
    gap_p = L["moanGap"] * (0.55 if side == "man" else 1)
    break_p = L["moanBreak"] * (0.4 if side == "man" else 1)
    tail_p = L["moanTail"] * (0.5 if side == "man" else 1)
    used = 0
    out: list[str] = []

    def maybe_moan() -> None:
        nonlocal used
        if used >= L["moanMax"] or not rng.chance(gap_p):
            return
        out.append(f" {rng.pick(moans)} " if rng.chance(0.5) else rng.pick(moans))
        used += 1

    seen = False
    for tok in tokens:
        if _is_content_tok(tok) and not _is_ellipsis_tok(tok) and len(tok) >= 2 and used < L["moanMax"] and rng.chance(break_p):
            if seen:
                maybe_moan()
            cut = 2 if (len(tok) >= 3 and rng.chance(0.4)) else 1
            out.append(tok[:cut])
            out.append(f" {rng.pick(moans)} " if rng.chance(0.5) else rng.pick(moans))
            used += 1
            out.append(tok[cut:])
            seen = True
            continue
        if _is_content_tok(tok) and seen:
            maybe_moan()
        out.append(tok)
        if _is_content_tok(tok):
            seen = True
    if used < L["moanMax"] and rng.chance(tail_p):
        out.append(f" {rng.pick(tails)}" if rng.chance(0.6) else rng.pick(tails))
    return re.sub(r"[ \t]+", " ", "".join(out)).strip()


def hear_line(text, *, side: str = "wife", level: str = "mid", seed: int = 0,
              enabled: bool = True, mode: str = "") -> dict:
    """隔門聽不清轉換。side=narration 時原樣回傳。回 {text, mode, fragments, original}。"""
    original = str(text or "")
    side = str(side or "wife").strip().lower()
    enabled = bool(enabled)
    level = normalize_muffle_level(level)
    forced = str(mode or "").strip().lower()
    if (not enabled) or side in ("narration", "nar", "旁白"):
        return {"text": original, "mode": "off", "fragments": [original] if _is_content_tok(original) else [], "original": original}
    compact = re.sub(r"\s+", "", original)
    if (not compact) or compact in ("—", "-", "–") or len(original) < 2:
        return {"text": original, "mode": "clear", "fragments": [original] if compact else [], "original": original}
    try:
        seed_i = int(seed)
    except (TypeError, ValueError):
        seed_i = 0
    rng = HearRng(fnv1a(f"{seed_i}|{side}|{original}|{level}|{forced}"))
    L = _HEAR_LEVELS.get(level) or _HEAR_LEVELS["mid"]
    if forced not in ("a", "b", "ab", "clear"):
        forced = _pick_mode(rng, level, side)
    out = original
    fragments: list[str] = []
    if forced == "clear":
        fragments = [t for t in tokenize_heard(original) if _is_content_tok(t)]
        out = original
    elif forced == "a":
        r = _apply_a(tokenize_heard(original), rng, L)
        out = r["text"] or original
        fragments = r["fragments"]
    elif forced == "b":
        out = _apply_b(original, rng, L, side) or original
        fragments = [
            t for t in tokenize_heard(out)
            if _is_content_tok(t) and not _is_ellipsis_tok(t) and t not in _MOAN_SET
        ]
    else:
        r = _apply_a(tokenize_heard(original), rng, L)
        out = _apply_b(r["text"] or original, rng, L, side) or r["text"] or original
        fragments = r["fragments"]
    out = re.sub(r"[ \t]+", " ", str(out or "")).strip() or original
    if _banned(out) and not _banned(original):
        out = original
    if not out:
        out = original
    if forced in ("a", "ab") and len(fragments) < 2 and len(re.sub(r"\s+", "", original)) >= 3:
        chars = list(re.sub(r"\s+", "", original))
        out = f"{chars[0]}……{''.join(chars[-2:])}"
        fragments = [chars[0], "".join(chars[-2:])]
    return {"text": out, "mode": forced, "fragments": fragments, "original": original}


def hear_through_door(text, *, side: str = "wife", level: str = "mid", seed: int = 0,
                      enabled: bool = True, mode: str = "") -> str:
    return hear_line(text, side=side, level=level, seed=seed, enabled=enabled, mode=mode)["text"]


def hear_dialog(row: dict | None, *, enabled: bool = True, level: str = "mid", seed: int = 0) -> dict:
    row = row if isinstance(row, dict) else {}
    narration = str(row.get("narration") or "")
    man = str(row.get("man") or "")
    wife = str(row.get("wife") or "")
    return {
        "narration": narration,
        "man": hear_through_door(man, side="man", level=level, seed=seed, enabled=enabled),
        "wife": hear_through_door(wife, side="wife", level=level, seed=seed, enabled=enabled),
        "man_orig": man,
        "wife_orig": wife,
        "narration_orig": narration,
    }


def _normalize_frac(v) -> str:
    s = str(v or "").strip().lower()
    if v in (2, 0.5) or s in ("2", "1/2", "0.5", "half"):
        return "1/2"
    if v in (0.6,) or s in ("3/5", "0.6", "0.60"):
        return "3/5"
    try:
        f = float(v)
    except (TypeError, ValueError):
        return ""
    if abs(f - 0.5) <= 0.02:
        return "1/2"
    if abs(f - 0.6) <= 0.02:
        return "3/5"
    return ""


def pick_peek(count: int = 1, rnd=None, side: str | None = None, fracs=None) -> dict:
    """一扇門同一邊（左或右）；每張圖獨立抽只顯示 1/2 或 3/5 寬。"""
    try:
        n = int(count)
    except (TypeError, ValueError):
        n = 1
    n = max(1, min(2, n))
    rng = rnd if hasattr(rnd, "random") else random.Random()
    side_v = side if side in ("left", "right") else ("left" if rng.random() < 0.5 else "right")
    out = []
    given = list(fracs) if isinstance(fracs, (list, tuple)) else []
    for i in range(n):
        hit = _normalize_frac(given[i]) if i < len(given) else ""
        out.append(hit or (PEEK_FRACS[0] if rng.random() < 0.5 else PEEK_FRACS[1]))
    return {"side": side_v, "fracs": out}


def _is_legacy_char_sec(v) -> bool:
    """仍是舊預設 0.9 或更早的 1.2 秒（尚未被使用者改成別的值）。"""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return False
    return any(abs(x - old) < 1e-6 for old in CHAR_SEC_LEGACY)


def clip_prompt(v, default: str = "") -> str:
    s = str(v if v is not None else "").strip()
    if not s:
        return default
    return s[:PROMPT_MAX]


def split_prompt_tags(text: str) -> list[str]:
    """依逗號切開提示詞，去掉空白，不分大小寫去重、保留首次出現的寫法。"""
    out: list[str] = []
    seen: set[str] = set()
    for part in str(text or "").replace("，", ",").split(","):
        tag = " ".join(part.split())
        if not tag:
            continue
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(tag)
    return out


def merge_prompt_tags(*parts: str) -> str:
    return ", ".join(split_prompt_tags(", ".join(str(p or "") for p in parts)))


def _tag_keys(text: str) -> list[str]:
    return [t.lower() for t in split_prompt_tags(text)]


def tags_equal(a: str, b: str) -> bool:
    return _tag_keys(a) == _tag_keys(b)


def strip_viewer_gaze(text: str) -> str:
    """正向裡不要留下 looking at viewer／鏡頭類標籤。"""
    ban = {t.lower() for t in LOOK_NEG_TAGS}
    return ", ".join(t for t in split_prompt_tags(text) if t.lower() not in ban)


def apply_gaze_defaults(text: str, kind: str) -> str:
    """補上視線標籤：舊預設會變成新預設；自訂內容只在缺的時候接在後面，不覆蓋。"""
    default = GLOBAL_POS_DEFAULT if kind == "pos" else GLOBAL_NEG_DEFAULT
    added = LOOK_POS_TAGS if kind == "pos" else LOOK_NEG_TAGS
    raw = str(text or "").strip()
    if not raw:
        return default
    out = merge_prompt_tags(raw, ", ".join(added))
    if kind == "pos":
        out = strip_viewer_gaze(out)
    return clip_prompt(out, default)


def _prompt_field(raw: dict, key: str, default: str) -> str:
    if key not in raw:
        return default
    return clip_prompt(raw.get(key), default)


def _config_from_raw(raw: dict | None) -> tuple[dict, bool]:
    """組設定；若 char_sec 仍是舊預設 0.9 或 1.2，回傳 (設定, 需要寫回)。其他欄位保留。"""
    raw = raw if isinstance(raw, dict) else {}
    wrote = bool("char_sec" in raw and raw.get("char_sec") is not None and _is_legacy_char_sec(raw.get("char_sec")))
    if wrote:
        char_sec = CHAR_SEC_DEFAULT
    elif "char_sec" in raw and raw.get("char_sec") is not None:
        char_sec = clamp_char_sec(raw.get("char_sec"))
    else:
        char_sec = CHAR_SEC_DEFAULT
    gpos = _prompt_field(raw, "global_prompt", GLOBAL_POS_DEFAULT)
    gneg = _prompt_field(raw, "global_negative", GLOBAL_NEG_DEFAULT)
    have_ver = raw.get("gaze_prompt_ver") == GAZE_PROMPT_VER
    # 舊檔還沒遷過：舊預設改成新預設；自訂只補缺的視線標籤。已遷過的不再改。
    if raw and not have_ver:
        if "global_prompt" in raw:
            gpos2 = apply_gaze_defaults(gpos, "pos")
            if not tags_equal(gpos, gpos2):
                gpos = gpos2
        else:
            gpos = GLOBAL_POS_DEFAULT
        if "global_negative" in raw:
            gneg2 = apply_gaze_defaults(gneg, "neg")
            if not tags_equal(gneg, gneg2):
                gneg = gneg2
        else:
            gneg = GLOBAL_NEG_DEFAULT
        wrote = True
    return {
        "char_sec": char_sec,
        "poses": clean_tags(raw.get("poses")),
        "global_prompt": gpos,
        "global_negative": gneg,
        "door_muffle": parse_muffle_enabled(raw.get("door_muffle") if "door_muffle" in raw else None, MUFFLE_DEFAULT),
        "door_muffle_level": (
            normalize_muffle_level(raw.get("door_muffle_level"))
            if "door_muffle_level" in raw else MUFFLE_LEVEL_DEFAULT
        ),
        "gaze_prompt_ver": GAZE_PROMPT_VER,
    }, wrote


def load_config(assets: Path) -> dict:
    """打字速度、自訂姿勢、預設正面／負面提示詞、隔門聽不清。缺檔或壞檔用程式預設，不依賴被 gitignore 的資產檔。
    若檔裡還是舊預設 0.9 或 1.2，自動遷到 0.6 並寫回（其他欄位保留）；使用者改過的其他值不動。
    預設正面／負面若仍是上一版（尚未含視線標籤），或自訂裡缺新標籤，載入時補上並寫回；不覆蓋已有的詞。"""
    ensure_dirs(assets)
    raw = {}
    p = config_path(assets)
    if p.is_file():
        try:
            data = json.loads(p.read_text("utf-8"))
            if isinstance(data, dict):
                raw = data
        except (OSError, json.JSONDecodeError):
            raw = {}
    cur, wrote = _config_from_raw(raw)
    if wrote:
        _atomic_write(p, json.dumps(cur, ensure_ascii=False, indent=2))
    return cur


def save_config(assets: Path, data: dict | None = None) -> dict:
    cur = load_config(assets)
    if isinstance(data, dict):
        if "char_sec" in data:
            cur["char_sec"] = clamp_char_sec(data.get("char_sec"))
        if "poses" in data:
            cur["poses"] = clean_tags(data.get("poses"))
        if "global_prompt" in data:
            cur["global_prompt"] = clip_prompt(data.get("global_prompt"), GLOBAL_POS_DEFAULT)
        if "global_negative" in data:
            cur["global_negative"] = clip_prompt(data.get("global_negative"), GLOBAL_NEG_DEFAULT)
        if "door_muffle" in data:
            cur["door_muffle"] = parse_muffle_enabled(data.get("door_muffle"), MUFFLE_DEFAULT)
        if "door_muffle_level" in data:
            cur["door_muffle_level"] = normalize_muffle_level(data.get("door_muffle_level"))
    _atomic_write(config_path(assets), json.dumps(cur, ensure_ascii=False, indent=2))
    return cur


def list_poses(assets: Path, extra_tags=None) -> list[dict]:
    """內建姿勢＋設定裡新增的＋圖庫／劇本 tags 出現過的，依 id 去重。"""
    cfg = load_config(assets)
    seen = set()
    out = []
    for row in STOCK_POSES:
        sid = str(row["id"])
        if sid in seen:
            continue
        seen.add(sid)
        out.append({"id": sid, "name": row["name"], "builtin": True})
    extras = list(cfg.get("poses") or [])
    if extra_tags:
        extras.extend(clean_tags(extra_tags))
    for sid in extras:
        if sid in seen:
            continue
        seen.add(sid)
        out.append({"id": sid, "name": sid, "builtin": False})
    return out


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
                if any(_same_tpl(system, d["system"]) for d in (OLD_DIALOG, PREV_DIALOG, PREV2_DIALOG)):
                    system = DEFAULT_DIALOG["system"]
                    changed = True
                if any(_same_tpl(user, d["user"]) for d in (OLD_DIALOG, PREV_DIALOG, PREV2_DIALOG)):
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
    {
        "id": "sc_reluctant_pleasure",
        "name": "不太情願卻很舒服",
        "enabled": True,
        "tags": ["missionary", "cowgirl"],
        "scenario": (
            "她是自己答應來做這份工作的，雖然嘴上有點彆扭、臉很紅，顯得不太情願又害臊，"
            "但沒有被強迫，也沒有威脅。身體卻比嘴老實，漸漸舒服起來，最後自己也承認很有感覺。"
            "旁白要寫兩人正在做什麼，以及她彆扭卻漸漸沉溺的表情、態度和肢體，還有男子發現她其實很有感覺時的得意。"
            "雙方都是成年人、你情我願。"
        ),
        "man_tone": "帶著發現她其實很舒服的得意，可以調侃她嘴上彆扭身體卻很誠實，語氣不要兇、不要威脅。",
        "wife_tone": "先小聲彆扭、害臊，後來忍不住漏出舒服的聲音，承認自己其實很有感覺；不要說被強迫，不要求救。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "她自己敞開身子讓他進來，臉別向一側、耳根紅透，眉心微蹙卻沒有推開；男人放慢節奏看著她，眼神發亮、嘴角帶笑，掌心按在她腰上感覺她越夾越緊，每一下都讓她肩頭輕輕發抖，嘴上還彆扭著。",
            "man": "嘴上不情願，身體卻夾這麼緊？",
            "wife": "別說了……可是真的，好舒服……",
        },
    },
    {
        "id": "sc_comes_around",
        "name": "被幹到迎合",
        "enabled": True,
        "tags": ["missionary", "cowgirl", "doggy"],
        "scenario": (
            "一開始她比較被動，躺著或撐著讓客人動；漸漸被頂到有感覺，開始自己扭腰、抬臀去迎合他的節奏。"
            "旁白要寫這個從被動變成主動迎合的過程，以及兩人的表情、態度和肢體。雙方都是你情我願。"
        ),
        "man_tone": "先誇她開始自己動了，語氣又饞又滿意，鼓勵她繼續迎上來。",
        "wife_tone": "從悶哼變成主動求再深一點，帶著終於忍不住迎合的害羞。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "一開始她只是躺著承受，手指鬆鬆抓著床單、眼神飄開；幾下之後腰卻自己抬起來迎他，唇間漏出黏熱的氣音，臉頰潮紅。男人低頭看她主動送上來，眼神又饞又滿意，托著她的臀加深每一次撞擊。",
            "man": "對，自己把腰抬起來，很會嘛。",
            "wife": "嗯……等一下，我自己會迎上去……",
        },
    },
    {
        "id": "sc_shy",
        "name": "害羞",
        "enabled": True,
        "tags": ["kiss", "missionary", "foreplay"],
        "scenario": (
            "她很害羞，會用手遮臉或摀嘴，聲音又細又小，不敢對上他的眼睛，身體卻沒有躲開。"
            "旁白要寫她遮臉、縮肩、細聲的樣子，以及男子放慢或靠近看她的態度與肢體。雙方都是你情我願。"
        ),
        "man_tone": "語氣偏低、帶笑，誘她把手放下來看他，不要兇。",
        "wife_tone": "細聲、斷斷續續，害臊地求他別一直看，偶爾悶在手心裡叫。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "她用雙手遮著發燙的臉，指縫間偷偷看他，聲音細得幾乎聽不見，肩頭縮著卻沒有躲開；男人把她的手輕輕拉開一點，低頭看她濕潤的眼睫，動作放慢，掌心沿著她腰側安撫，語氣低而帶笑。",
            "man": "把手放下來，讓我看看你的臉。",
            "wife": "不要一直看……好害羞……嗯……",
        },
    },
    {
        "id": "sc_hard_start",
        "name": "男子一來就猛幹",
        "enabled": True,
        "tags": ["missionary", "doggy"],
        "scenario": (
            "客人一進來就節奏很重、一下子頂到最深，她被頂得發顫、有點招架不住，卻明顯很有感覺，也願意繼續。"
            "旁白要寫他一開始就很猛的動作，以及她被頂到發軟的表情、態度和肢體，還有他專注又興奮的樣子。"
            "雙方都是你情我願，不是強迫。"
        ),
        "man_tone": "喘得急、句子短，直說好緊、再夾，興致很高但不威脅。",
        "wife_tone": "又甜又喘，求他稍慢又承認好深好舒服，是被頂得很爽的求饒式撒嬌，不是拒絕。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "他一壓上來就頂到最深處，節奏又重又急，額角是汗、眼神發亮；她被頂得聲音發顫，眉心皺緊、手指死死抓著床單，腿卻主動纏上他的腰，身體一下一下地發抖，顯然被弄得很有感覺。",
            "man": "一進來就這麼緊，再夾一下。",
            "wife": "啊……太、太深了……好舒服，稍、稍慢一點……",
        },
    },
    {
        "id": "sc_falls_for_him",
        "name": "幹到愛上",
        "enabled": True,
        "tags": ["cowgirl", "kiss", "missionary"],
        "scenario": (
            "做到後來她完全沉進去，當下對這個客人又黏又迷戀，會主動抱緊、索吻、說出黏人的話。"
            "旁白要寫她眼神發軟、腰主動貼上去、手不讓他離開的肢體，以及男子被她這副樣子取悅的表情與態度。"
            "這是這一刻的迷戀，不要寫強迫。"
        ),
        "man_tone": "又得意又寵，回應她的黏人，問她是不是離不開。",
        "wife_tone": "黏人、撒嬌、當下告白式的迷戀，求他再近一點、不要停；說話帶自然的吟叫與斷續。",
        "system": "",
        "user": "",
        "fallback": {
            "narration": "做到後來她整個人軟在他身上，眼神迷離、雙手緊緊環住他的脖子不讓他退開，腰還主動往上貼；男人被她這副黏人的樣子取悅，吻著她發燙的耳尖，動作又深又穩，看她一下一下把自己送上來。",
            "man": "嗯……這麼黏我，是不是有點愛上了？",
            "wife": "嗯……再近一點，不要停，好喜歡……",
        },
    },
]


def _is_builtin_tpl(system: str, user: str) -> bool:
    """系統或使用者提示是否等於某一版內建預設（含舊版）。"""
    sys_hit = any(_same_tpl(system, d["system"]) for d in (OLD_DIALOG, PREV_DIALOG, PREV2_DIALOG, DEFAULT_DIALOG))
    user_hit = any(_same_tpl(user, d["user"]) for d in (OLD_DIALOG, PREV_DIALOG, PREV2_DIALOG, DEFAULT_DIALOG))
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
        "man_tone": _clip(raw.get("man_tone"), 600),
        "wife_tone": _clip(raw.get("wife_tone"), 600),
        "system": system,
        "user": user,
        "fallback": fb,
    }


def stock_scripts() -> list[dict]:
    """內建劇本一律從程式碼生成，不讀被 gitignore 的資產檔。"""
    return [s for s in (clean_script(x) for x in STOCK_SCRIPTS) if s]


def stock_script_ids() -> set[str]:
    return {s["id"] for s in stock_scripts()}


def _clean_script_list(items) -> list[dict]:
    out = []
    seen = set()
    for it in items or []:
        row = clean_script(it) if isinstance(it, dict) else None
        if not row or row["id"] in seen:
            continue
        seen.add(row["id"])
        out.append(row)
    return out


def _read_scripts_blob(assets: Path) -> tuple[list, set[str] | None, bool]:
    """回 (原始 list, seen_stock_ids 或 None 表示舊檔沒這個欄位, 檔案是否存在且可解析)。"""
    p = scripts_path(assets)
    if not p.is_file():
        return [], None, False
    try:
        data = json.loads(p.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return [], None, False
    if isinstance(data, list):
        return data, None, True
    if isinstance(data, dict):
        items = data.get("scripts")
        if not isinstance(items, list):
            items = []
        raw_seen = data.get("seen_stock_ids")
        if isinstance(raw_seen, list):
            seen = {str(x).strip() for x in raw_seen if str(x).strip()}
            return items, seen, True
        return items, None, True
    return [], None, False


def merge_stock_scripts(existing, seen_stock_ids: set[str] | None = None) -> tuple[list[dict], set[str], bool]:
    """保留使用者既有劇本（含改過的內建）。缺少的內建依 id 補上；已記在 seen 卻被刪掉的不復活。"""
    rows = _clean_script_list(existing)
    have = {s["id"] for s in rows}
    seen = set(have) if seen_stock_ids is None else set(seen_stock_ids)
    changed = False
    for stock in stock_scripts():
        if stock["id"] not in have and stock["id"] not in seen:
            rows.append(stock)
            have.add(stock["id"])
            changed = True
    seen |= stock_script_ids()
    return rows, seen, changed


def _seed_scripts(assets: Path) -> list[dict]:
    """第一次：從程式碼寫入全部內建劇本。若 dialog.json 是使用者改過的模板，放到第一筆並保留原文。"""
    scripts = list(stock_scripts())
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
    """缺檔、空檔或壞檔就從 STOCK_SCRIPTS 種子；舊檔則依 id 補上新的內建，不覆蓋使用者改過的內容。"""
    ensure_dirs(assets)
    items, seen, ok = _read_scripts_blob(assets)
    cleaned = _clean_script_list(items) if ok else []
    if not ok or not cleaned:
        scripts = _seed_scripts(assets)
        save_scripts(assets, scripts, seen_stock_ids=stock_script_ids() | {s["id"] for s in scripts})
        return scripts
    scripts, seen2, changed = merge_stock_scripts(cleaned, seen)
    p = scripts_path(assets)
    need_seen_field = True
    try:
        data = json.loads(p.read_text("utf-8"))
        need_seen_field = not (isinstance(data, dict) and isinstance(data.get("seen_stock_ids"), list))
    except (OSError, json.JSONDecodeError):
        need_seen_field = True
    if changed or need_seen_field:
        save_scripts(assets, scripts, seen_stock_ids=seen2)
    return scripts


def save_scripts(assets: Path, scripts: list[dict], seen_stock_ids=None) -> list[dict]:
    ensure_dirs(assets)
    rows = _clean_script_list(scripts)
    if seen_stock_ids is None:
        _, prev, ok = _read_scripts_blob(assets)
        seen = set(prev or set())
    else:
        seen = {str(x).strip() for x in seen_stock_ids if str(x).strip()}
    seen |= stock_script_ids()
    _atomic_write(
        scripts_path(assets),
        json.dumps({"scripts": rows, "seen_stock_ids": sorted(seen)}, ensure_ascii=False, indent=2),
    )
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


def compose_gen_prompts(cfg: dict | None, item_prompt: str = "", item_negative: str = "",
                        variables: dict | None = None) -> dict:
    """合併全域預設與單張 prompt／negative（不分大小寫去重）。
    正向：預設在前、單張接在後（空單張用 DEFAULT_ITEM_PROMPT）。
    負向：預設 + 單張 + 安全 DEFAULT_NEGATIVE（child／loli 等 18+ 規則不變）。
    lead／extra 分別給 ImgGenIn，讓廣角雙人詞壓在 Comfy prompt 最前面。"""
    cfg = cfg if isinstance(cfg, dict) else {}
    gpos = strip_viewer_gaze(clip_prompt(cfg.get("global_prompt"), GLOBAL_POS_DEFAULT))
    gneg = clip_prompt(cfg.get("global_negative"), GLOBAL_NEG_DEFAULT)
    item_pos = strip_viewer_gaze(expand(item_prompt or "", variables))
    item_neg = expand(item_negative or "", variables)
    if not item_pos.strip():
        item_pos = strip_viewer_gaze(expand(DEFAULT_ITEM_PROMPT, variables))
    positive = strip_viewer_gaze(merge_prompt_tags(gpos, item_pos))
    negative = merge_prompt_tags(gneg, item_neg, DEFAULT_NEGATIVE)
    return {
        "global_prompt": gpos,
        "global_negative": gneg,
        "item_prompt": item_pos,
        "item_negative": item_neg,
        "positive": positive,
        "negative": negative,
        "lead": gpos,
        "extra": item_pos,
    }


def pick_count(rnd=None) -> int:
    roll = rnd if callable(rnd) else (rnd.random if hasattr(rnd, "random") else random.random)
    return 1 if float(roll()) < 0.5 else 2


def pick_items(items: list, pose: str = "", count: int | None = None, rnd=None) -> list:
    """從這個姿勢已選的底圖隨機抽 1 或 2 張（各半）。
    只選了 1 張就固定 1 張；沒選就空。不會從其他姿勢補張。沒指定姿勢時才從全部圖抽。
    池子可超過 2 張，一次最多抽出 PICK_MAX 張。"""
    pose = str(pose or "").strip()
    if pose:
        pool = items_for_pose(items, pose)
    else:
        pool = [x for x in (items or []) if isinstance(x, dict) and x.get("id") and x.get("url")]
    if not pool:
        return []
    rng = rnd if hasattr(rnd, "sample") else random.Random()
    if len(pool) == 1:
        n = 1
    else:
        n = int(count) if count in (1, 2) else pick_count(rng)
        n = min(n, PICK_MAX, len(pool))
    if len(pool) <= n:
        return list(pool)
    return rng.sample(pool, n)


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
    man_tone = str(script.get("man_tone") or info.get("man_tone") or "").strip()
    wife_tone = str(script.get("wife_tone") or info.get("wife_tone") or "").strip()
    if man_tone:
        extra.append(f"男子語氣：{man_tone}")
    if wife_tone:
        extra.append(f"妻子語氣：{wife_tone}")
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
