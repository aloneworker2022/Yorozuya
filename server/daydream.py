"""發呆時段：伺服器權威預產圖。

6:00／14:00／19:00／3:00 開窗。關網頁、關螢幕也照跑——由 main.py 的迴圈
讀存檔、丟進 gen_tasks、完成後補回 succubi。本模組只做時窗／工作單／套圖，
不碰 GPU、不碰 SQLite。
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "web" / "content"
FRAME_INDEX = ROOT / "assets" / "frame_packs" / "index.json"

SLOTS = [
    {"id": "morning", "label": "早上", "h": 6, "m": 0},
    {"id": "afternoon", "label": "下午", "h": 14, "m": 0},
    {"id": "evening", "label": "晚上", "h": 19, "m": 0},
    {"id": "night", "label": "深夜", "h": 3, "m": 0},
]

HALF_EMOTIONS = {
    "xi": {"shot": "half_xi", "label": "喜",
           "tags": "happy expression, soft smile, cheerful, gentle smile, looking at viewer"},
    "nu": {"shot": "half_nu", "label": "怒",
           "tags": "angry expression, furrowed brows, frown, upset, glaring"},
    "ai": {"shot": "half_ai", "label": "哀",
           "tags": "sad expression, teary eyes, sorrowful, downcast eyes, melancholy"},
    "le": {"shot": "half_le", "label": "樂",
           "tags": "joyful expression, bright smile, laughing, delighted, sparkling eyes"},
    "xiu": {"shot": "half_xiu", "label": "害羞",
            "tags": "shy, blush, bashful, embarrassed smile, looking aside, fidgeting"},
}
HALF_EMOTION_KEYS = ["xi", "nu", "ai", "le", "xiu"]

KIND_ZH = {"tease": "調戲", "oral": "口交", "sex": "做愛"}
KIND_SCENES = {"tease": [1], "oral": [1, 4], "sex": [1, 2, 3, 4, 5]}
SCENE_ZH = {
    1: "場景1 · 開場", 2: "場景2 · 正戲", 3: "場景3 · 投入",
    4: "場景4 · 玩家高潮", 5: "場景5 · 雙方高潮",
}

SEX_COMMON = (
    "black background, solid black background, simple background, close-up, "
    "extreme close-up, widescreen, lower abdomen focus, hips, inner thighs, "
    "1girl, 1boy, adult woman, adult man, nude, pussy focus, penis, erect penis, "
    "labia, vulva, uncensored, nsfw, explicit, head out of frame, no faces, "
    "same camera, same crop"
)
SEX_COMMON_NEG = (
    "text, letters, numbers, caption, watermark, signature, comic, 4koma, "
    "sprite sheet, multiple panels, collage, face, looking at viewer, full body, "
    "wide shot, white background, grey background, scenery, censored, mosaic, "
    "bar censor, child, loli, chibi"
)
SEX_BEATS = [
    {"zh": "龜頭插入陰唇", "tags": "glans, glans inserting into labia, outer labia",
     "extraNeg": "hidden glans, white background, scenery"},
    {"zh": "插入（不畫龜頭）", "tags": "vaginal penetration, labia",
     "extraNeg": "glans, hidden glans"},
    {"zh": "整根陰莖在陰道內",
     "tags": "penis, short penis, penis in vagina, entire penis in vagina",
     "extraNeg": "half inserted, shaft outside, penis still outside, glans"},
    {"zh": "抽出中段（同第 2 幀）", "tags": "vaginal penetration, labia",
     "extraNeg": "glans, hidden glans"},
]
SEX_POSES = [
    {"id": "missionary", "label": "正常",
     "shared": "missionary, missionary position, from front, facing him, female lower abdomen, male lower abdomen, navel",
     "extraNeg": "doggy, from behind, ass focus, cowgirl, girl on top, straddling"},
    {"id": "doggy", "label": "背後",
     "shared": "doggy, doggy style, from behind, ass, pussy from behind, male pubic hair",
     "extraNeg": "cowgirl, girl on top, straddling, missionary, facing him, navel"},
    {"id": "cowgirl_front", "label": "正面騎乘",
     "shared": "cowgirl, girl on top, straddling, facing him, female lower abdomen, male lower abdomen, navel, male pubic hair",
     "extraNeg": "doggy, from behind, ass focus, missionary"},
]
SEX_AROUSAL_MID = {"tags": "wet, glistening, aroused", "extraNeg": "squirting"}
STYLE_TAG = {"anime": "anime", "realistic": "photorealistic", "pixel": "pixel art, pixelated"}
GENITAL_TRAITS = {
    "labia_size": [
        ("內收小巧的陰唇", "innies, small labia, innie pussy", "outies, large labia, plump labia, protruding labia"),
        ("適中微開的陰唇", "slightly parted labia", "innies, outies, large labia"),
        ("外翻飽滿的陰唇", "outies, large labia, plump labia, protruding inner labia", "innies, small labia, innie pussy"),
    ],
    "clitoris_size": [
        ("小巧含蓄的陰蒂", "small clitoris", "large clitoris, prominent clitoris, huge clitoris"),
        ("明顯可見的陰蒂", "clitoris", "huge clitoris"),
        ("腫大突出的陰蒂", "large clitoris, prominent clitoris", "small clitoris, tiny clitoris"),
    ],
    "labia_color": [
        ("粉嫩淺色的陰唇", "pink pussy, pink labia, pale labia", "dark pussy, dark labia, brown labia"),
        ("淺褐自然的陰唇", "brown labia", "pink pussy, pale labia, dark pussy"),
        ("深褐近黑的陰唇", "dark pussy, dark labia", "pink pussy, pink labia, pale labia"),
    ],
    "pubic_hair": [
        ("完全剃光、沒有陰毛", "shaved, completely shaved, no pubic hair", "pubic hair, bush, thick pubic hair, sparse pubic hair"),
        ("稀疏細軟的陰毛", "sparse pubic hair, light pubic hair", "shaved, completely shaved, bush, thick pubic hair"),
        ("適中自然的陰毛", "pubic hair", "shaved, no pubic hair, completely shaved, bush, thick pubic hair"),
        ("濃密茂盛的陰毛", "thick pubic hair, bush, messy pubic hair", "shaved, no pubic hair, completely shaved, sparse pubic hair"),
    ],
}

_script_cache = {"t": 0.0, "data": {"packs": []}}
_frame_cache = {"t": 0.0, "packs": []}


def _hm(h, m):
    return int(h) * 60 + int(m)


def current_slot(now: datetime | None = None) -> dict:
    d = now or datetime.now()
    now_min = d.hour * 60 + d.minute
    starts = sorted(({**s, "min": _hm(s["h"], s["m"])} for s in SLOTS), key=lambda x: x["min"])
    hit = starts[-1]
    for s in starts:
        if now_min >= s["min"]:
            hit = s
    return hit


def slot_stamp(now: datetime | None = None) -> str:
    d = now or datetime.now()
    slot = current_slot(d)
    now_min = d.hour * 60 + d.minute
    start_min = _hm(slot["h"], slot["m"])
    day = d
    if now_min < start_min:
        day = d - timedelta(days=1)
    return f"{day.year:04d}-{day.month:02d}-{day.day:02d}-{slot['id']}"


def slot_label(slot_id: str) -> str:
    for s in SLOTS:
        if s["id"] == slot_id:
            return s["label"]
    return current_slot()["label"]


def new_store() -> dict:
    return {
        "stamp": "",
        "slot": "",
        "running": False,
        "completed": False,
        "force": False,
        "done": 0,
        "total": 0,
        "label": "",
        "girlId": "",
        "queue": [],
        "patches": {},
    }


def public_status(store: dict | None) -> dict:
    s = store or {}
    return {
        "stamp": s.get("stamp") or "",
        "slot": s.get("slot") or "",
        "running": bool(s.get("running")),
        "completed": bool(s.get("completed")),
        "label": s.get("label") or "",
        "done": int(s.get("done") or 0),
        "total": int(s.get("total") or 0),
        "girlId": s.get("girlId") or "",
        "force": bool(s.get("force")),
    }


def slim_girl(g: dict) -> dict:
    skip = {"history", "chatSess", "sacScript", "cardCg", "journal"}
    return {k: v for k, v in (g or {}).items() if k not in skip}


def fill_binds(text, girl, player="你") -> str:
    raw = str(text or "")
    if not raw:
        return ""
    name = str((girl or {}).get("name") or "她")
    look = (girl or {}).get("look") if isinstance((girl or {}).get("look"), dict) else {}
    eye = str(look.get("eye") or "")
    breast = str(look.get("breast") or "")
    s = raw
    for a, b in (
        ("[name]", name), ("{name}", name),
        ("[player]", player), ("{player}", player),
        ("[eye]", eye), ("[breast]", breast),
    ):
        s = re.sub(re.escape(a), b, s, flags=re.I)
    return s


def genital_tags(look: dict | None) -> tuple[str, str]:
    look = look or {}
    bits, negs = [], []
    for axis, rows in GENITAL_TRAITS.items():
        text = str(look.get(axis) or "")
        for row in rows:
            if row[0] == text:
                bits.append(row[1])
                if row[2]:
                    negs.append(row[2])
                break
    return ", ".join(x for x in bits if x), ", ".join(x for x in negs if x)


def sex_frames(pose_id: str, style: str, look: dict | None) -> dict:
    pose = next((p for p in SEX_POSES if p["id"] == pose_id), SEX_POSES[0])
    g_pos, g_neg = genital_tags(look)
    st = STYLE_TAG.get(style) or STYLE_TAG["anime"]
    neg = ", ".join(x for x in (SEX_COMMON_NEG, pose.get("extraNeg"), SEX_AROUSAL_MID["extraNeg"], g_neg) if x)
    frames = []
    for beat in SEX_BEATS:
        pos = ", ".join(x for x in (
            SEX_COMMON, pose["shared"], SEX_AROUSAL_MID["tags"], beat["tags"], g_pos, st,
        ) if x)
        frames.append({
            "zh": beat["zh"],
            "pos": pos,
            "extraNeg": ", ".join(x for x in (beat.get("extraNeg") or "", g_neg) if x),
        })
    return {"pose": pose, "neg": neg, "frames": frames}


def load_script_packs() -> dict:
    now = datetime.now().timestamp()
    if _script_cache["data"] and now - _script_cache["t"] < 30:
        return _script_cache["data"]
    try:
        data = json.loads((CONTENT / "script_packs.json").read_text("utf-8"))
    except Exception:
        data = {"packs": []}
    if not isinstance(data, dict):
        data = {"packs": []}
    data.setdefault("packs", [])
    _script_cache["data"] = data
    _script_cache["t"] = now
    return data


def load_frame_packs() -> list:
    now = datetime.now().timestamp()
    if _frame_cache["packs"] and now - _frame_cache["t"] < 30:
        return _frame_cache["packs"]
    try:
        data = json.loads(FRAME_INDEX.read_text("utf-8"))
        packs = data.get("packs") if isinstance(data, dict) else data
        packs = packs if isinstance(packs, list) else []
    except Exception:
        packs = []
    _frame_cache["packs"] = packs
    _frame_cache["t"] = now
    return packs


def frame_pack(pack_id: str, pose_id: str = "") -> dict | None:
    packs = load_frame_packs()
    if pack_id:
        for p in packs:
            if p.get("id") == pack_id:
                return p
    if pose_id:
        for p in packs:
            if p.get("pose") == pose_id:
                return p
    return None


def pack_frame_url(pack: dict | None, index: int) -> str:
    if not pack:
        return ""
    frames = pack.get("frames") or {}
    rec = frames.get(str(index)) or frames.get(index) or {}
    return str(rec.get("url") or "").strip()


def list_script_jobs() -> list:
    data = load_script_packs()
    out = []
    for p in data.get("packs") or []:
        if not isinstance(p, dict):
            continue
        kind = p.get("kind") or "tease"
        scenes = p.get("scenes") if isinstance(p.get("scenes"), dict) else {}
        for n in KIND_SCENES.get(kind, [1]):
            spec = scenes.get(str(n))
            if not isinstance(spec, dict):
                continue
            out.append({
                "pack": p,
                "packId": p.get("id"),
                "packName": p.get("name") or "",
                "kind": kind,
                "scene": n,
                "spec": spec,
                "label": f"{KIND_ZH.get(kind, kind)}「{p.get('name') or ''}」{SCENE_ZH.get(n) or ('場景' + str(n))}",
            })
    return out


def narr_last(spec: dict, girl: dict, player: str) -> str:
    lines = [fill_binds(x, girl, player) for x in (spec.get("narr") or []) if str(x or "").strip()]
    return (lines[-1] if lines else "") or "……"


def parse_pose_lines(raw: str) -> str:
    t = str(raw or "")
    face = re.search(r"表情[:：]\s*(.+)", t)
    body = re.search(r"動作[:：]\s*(.+)", t)
    bits = []
    if face:
        bits.append(face.group(1).strip())
    if body:
        bits.append(body.group(1).strip())
    return ", ".join(x for x in bits if x)


def reply_msgs(girl_name, attitude, narr, stage) -> list:
    who = girl_name or "她"
    sys = "\n".join(x for x in [
        f"你是「{who}」。只輸出台詞，不要旁白、不要引號、不要寫身體畫面。",
        "1～3 句繁中。旗標不要。",
        f"關係階段：{stage or 'stranger'}。",
        f"這一景態度：{attitude}" if attitude else "",
        f"旁白若點名「{who}」，那就是在對你。",
    ] if x)
    return [
        {"role": "system", "content": sys},
        {"role": "user", "content": f"（旁白：{narr}。用口語接這一拍。）"},
    ]


def pose_msgs(girl_name, reply) -> list:
    return [
        {"role": "system", "content": (
            "把她的台詞翻成生圖用的表情與動作。\n"
            "只輸出兩行：\n表情：英文 danbooru tags\n動作：英文 danbooru tags\n"
            "不要敘事、不要中文、不要編號。"
        )},
        {"role": "user", "content": f"「{girl_name or '她'}」說了：「{str(reply or '')[:200]}」。只輸出兩行。"},
    ]


def pose_ref_for_slot(spec, slot, slot_index, pack, frame) -> str:
    own = str((slot or {}).get("ref") or "").strip()
    if own:
        return own
    if (spec or {}).get("imgMode") != "ref":
        return ""
    n = (max(0, int(slot_index or 0)) % 4) + 1
    return pack_frame_url(frame, n)


def build_queue(girls: list, nsfw: bool, stamp: str) -> list:
    jobs = []
    for g in girls:
        if not isinstance(g, dict) or not g.get("id"):
            continue
        gid = g["id"]
        jobs.append({
            "girlId": gid, "kind": "portraits", "label": "立繪三張",
            "key": f"daydream:{stamp}:{gid}:portraits",
        })
        for ek in HALF_EMOTION_KEYS:
            defn = HALF_EMOTIONS[ek]
            jobs.append({
                "girlId": gid, "kind": "emotion", "mood": ek,
                "label": f"表情 · {defn['label']}",
                "key": f"daydream:{stamp}:{gid}:emo:{ek}",
            })
        if nsfw and not g.get("ntr"):
            for pose in SEX_POSES:
                jobs.append({
                    "girlId": gid, "kind": "sex", "poseId": pose["id"],
                    "label": f"做愛動畫 · {pose['label']}",
                    "key": f"daydream:{stamp}:{gid}:sex:{pose['id']}",
                })
            for job in list_script_jobs():
                jobs.append({
                    "girlId": gid, "kind": "script",
                    "packId": job["packId"], "scene": job["scene"],
                    "label": job["label"],
                    "key": f"daydream:{stamp}:{gid}:script:{job['packId']}:{job['scene']}",
                })
    return jobs


def apply_patches(data: dict, store: dict) -> None:
    if not isinstance(data, dict) or not store:
        return
    patches = store.get("patches") or {}
    girls = data.get("succubi") if isinstance(data.get("succubi"), list) else []
    by_id = {g.get("id"): g for g in girls if isinstance(g, dict) and g.get("id")}
    for gid, patch in patches.items():
        g = by_id.get(gid)
        if not g or not isinstance(patch, dict):
            continue
        if patch.get("portraits"):
            g.setdefault("portraits", {}).update(patch["portraits"])
        if patch.get("extraShotAt"):
            g.setdefault("extraShotAt", {}).update(patch["extraShotAt"])
        if "portraitsRefreshedAt" in patch:
            g["portraitsRefreshedAt"] = patch["portraitsRefreshedAt"]
        if patch.get("sexAnim"):
            g.setdefault("sexAnim", {}).update(patch["sexAnim"])
        if patch.get("scriptArt"):
            g.setdefault("scriptArt", {})
            for pid, scenes in patch["scriptArt"].items():
                if not isinstance(scenes, dict):
                    continue
                g["scriptArt"].setdefault(pid, {}).update(scenes)
    pub = public_status(store)
    if pub.get("stamp") or pub.get("running") or pub.get("completed"):
        data["daydream"] = pub


def set_patch(store: dict, gid: str, **fields) -> dict:
    bucket = store.setdefault("patches", {}).setdefault(gid, {})
    for k, v in fields.items():
        if k in ("portraits", "extraShotAt", "sexAnim") and isinstance(v, dict):
            bucket.setdefault(k, {}).update(v)
        elif k == "scriptArt" and isinstance(v, dict):
            art = bucket.setdefault("scriptArt", {})
            for pid, scenes in v.items():
                if isinstance(scenes, dict):
                    art.setdefault(pid, {}).update(scenes)
        else:
            bucket[k] = v
    return bucket
