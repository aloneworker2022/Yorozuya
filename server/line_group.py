"""名冊群 LINE：RP5 讓妹子主動發文、群友接話（手機關著也照走）。

數字跟手機 web/content/line_social.js 同一套。手機把訊息存在 state.lineGroup.messages；
這裡寫進自己的 feed（line_group 表），手機開著時 GET /api/line/feed 合併、GET /api/save 也會先蓋上（id 去重）。
一輪最多寫一則（一次模型），模型沒回或漏秘密就用範本句。
"""
from __future__ import annotations

import math
import random
import re
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import life_agent

_TOKYO = ZoneInfo("Asia/Tokyo")
MIN_MS = 60 * 1000
HOUR_MS = 60 * MIN_MS

# ── 旋鈕 ──
P_LO, P_HI, MIN_AT_LO, MIN_AT_HI = 30, 90, 240.0, 30.0
MIN_MIN, MAX_MIN = 15.0, 360.0
GOOD, LOW, LURK = 0.6, 1.5, 0.3
CHIME_MS = 10 * MIN_MS
CHIME_P = 0.5          # 有人 10 分鐘內說話，每個醒著的群友一半機率插話
CHIME_P_CHAIN = 0.25   # 插話的插話（最多兩層）
REACT_MAX = 2          # 一則最多兩個人接
CHAIN_MAX = 2
QUEUE_CAP = 6
FEED_CAP = 300
OVERDUE_MS = 2 * HOUR_MS   # 伺服器停太久：不補發，重新排
WAKE_POST = (5, 25)        # 剛睡醒幾分鐘內可能發早安

PERSONALITY_FAMILY = {"高冷": "冷淡", "傲嬌": "冷淡", "文靜溫柔": "溫柔", "御姊": "溫柔",
                      "活潑開朗": "熱絡", "天然呆": "熱絡", "病嬌": "佔有", "清純反差": "反差"}
STAGE_KEYS = ["stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate", "lover",
              "wife", "devoted_wife", "obedient_wife", "pathological_wife"]
STAGE_ZH = dict(zip(STAGE_KEYS, ["陌生", "認識", "朋友", "親密好友", "女友", "熱戀", "愛人", "妻子", "貼心妻子", "順從妻子", "病態妻子"]))
STAGE_IDX = {k: i for i, k in enumerate(STAGE_KEYS)}
AT_PLAYER = [0, 0.05, 0.1, 0.15, 0.3, 0.35, 0.4, 0.5, 0.55, 0.6, 0.7]  # 主動發文 @他 的機率（依 11 階）
GOOD_MOODS = {"愉快", "臉紅心跳"}
LOW_MOODS = {"低落", "不悅", "不安", "虛脫", "心虛"}
AFF_DELTA = {"needle": -8, "claim": -5, "tease": -3, "agree": 3, "chat": 2}
SECRET_RE = re.compile(r"做愛|上床|性交|外遇|出軌|偷情|偷吃|約炮|炮友|精液|內射|中出|被.{0,4}(?:幹|肏|上了)|光著身子|全裸|裸著|色狼|變態|露出狂|陌生男|搭訕.{0,6}(?:親|摸)")


def stage_idx(key) -> int:
    return STAGE_IDX.get(str(key or ""), 0)


def is_wife(key) -> bool:
    return stage_idx(key) >= STAGE_IDX["wife"]


def is_dating(key) -> bool:
    return stage_idx(key) >= STAGE_IDX["girlfriend"]


def base_personality(g: dict) -> str:
    arch = str(g.get("archetype") or "")
    if arch in PERSONALITY_FAMILY:
        return arch
    for n in g.get("personality") or []:
        if n in PERSONALITY_FAMILY:
            return n
    return arch or "文靜溫柔"


def family_of(g: dict) -> str:
    return PERSONALITY_FAMILY.get(base_personality(g), "溫柔")


def stage_of(g: dict) -> str:
    k = str(g.get("roomStage") or g.get("stage") or "stranger")
    return k if k in STAGE_IDX else "stranger"


# ── 間隔 ──
def base_interval_min(proactivity) -> float:
    try:
        p = float(proactivity)
    except (TypeError, ValueError):
        p = 50.0
    t = (p - P_LO) / (P_HI - P_LO)
    m = MIN_AT_LO * math.pow(MIN_AT_HI / MIN_AT_LO, t)
    return max(MIN_MIN, min(MAX_MIN, m))


def interval_mult(mood="平靜", mood_level=0, hunger=0.0, event_ago_min=float("inf")) -> float:
    m = 1.0
    if mood in GOOD_MOODS and mood_level >= 25:
        m *= GOOD
    if hunger >= 70:
        m *= GOOD
    if event_ago_min <= 60:
        m *= GOOD
    if mood in LOW_MOODS and mood_level >= 25:
        m *= LOW
    return m


def interval_min(proactivity, rnd=random.random, **kw) -> float:
    jitter = 0.75 + rnd() * 0.5
    return max(MIN_MIN * 0.6, base_interval_min(proactivity) * interval_mult(**kw) * jitter)


def _hash32(s: str) -> int:
    h = 2166136261
    for c in s:
        h ^= ord(c)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def lurks_today(gid: str, family: str, day_key: str) -> bool:
    if family != "冷淡":
        return False
    return (_hash32(f"{gid}|{day_key}") % 1000) / 1000 < LURK


def jst_day(now_ms: int) -> str:
    return datetime.fromtimestamp(now_ms / 1000, _TOKYO).strftime("%Y-%m-%d")


# ── 合不合 ──
_PAIR = {("熱絡", "溫柔"): 20, ("冷淡", "熱絡"): -5, ("反差", "溫柔"): 5}


def family_pair_score(fa: str, fb: str) -> int:
    if fa == "佔有" and fb == "佔有":
        return -15
    if "佔有" in (fa, fb):
        return -20
    if fa == fb:
        return 20
    return _PAIR.get((fa, fb), _PAIR.get((fb, fa), 0))


def _names(items) -> set:
    out = set()
    for x in items or []:
        n = x if isinstance(x, str) else (x.get("name") if isinstance(x, dict) else "")
        if n and str(n).strip():
            out.add(str(n).strip())
    return out


def seed_affinity(ga: dict, gb: dict) -> int:
    base = family_pair_score(family_of(ga), family_of(gb))
    hob = min(24, len(_names(ga.get("hobbies")) & _names(gb.get("hobbies"))) * 8)
    like = min(15, len(_names(ga.get("likes")) & _names(gb.get("likes"))) * 5)
    return max(-60, min(60, base + hob + like))


def pair_key(a, b) -> str:
    return "|".join(sorted([str(a), str(b)]))


def affinity_now(rec: dict | None, now_ms: int) -> float:
    if not rec:
        return 0.0
    seed = float(rec.get("seed") or 0)
    v = float(rec["v"]) if rec.get("v") is not None else seed
    hours = max(0.0, (now_ms - float(rec.get("at") or now_ms)) / HOUR_MS)
    return seed + (v - seed) * math.pow(0.5, hours / 24)


def get_affinity(aff: dict, ga: dict, gb: dict, now_ms: int) -> float:
    if not ga or not gb or ga.get("id") == gb.get("id"):
        return 0.0
    rec = (aff or {}).get(pair_key(ga["id"], gb["id"]))
    if not rec:
        return float(seed_affinity(ga, gb))
    return affinity_now(rec, now_ms)


def bump_affinity(aff: dict, ga: dict, gb: dict, delta: float, now_ms: int) -> float:
    key = pair_key(ga["id"], gb["id"])
    rec = aff.get(key)
    if not rec:
        s = seed_affinity(ga, gb)
        rec = aff[key] = {"seed": s, "v": s, "at": now_ms}
    rec["v"] = max(-100.0, min(100.0, affinity_now(rec, now_ms) + delta))
    rec["at"] = now_ms
    return rec["v"]


def affinity_word(v: float) -> str:
    if v >= 30:
        return "很合"
    if v >= 10:
        return "還不錯"
    if v <= -30:
        return "很不合"
    if v <= -10:
        return "不太合"
    return "普通"


# ── 稱呼、秘密、長度 ──
def scrub_husband(text: str, stage: str, pet: str = "") -> str:
    if is_wife(stage) or "老公" not in text:
        return text
    return text.replace("老公", pet.strip() if (pet and pet.strip() and is_dating(stage)) else "你")


def address_rule(stage: str, pet: str = "", player: str = "") -> str:
    pet = (pet or "").strip()
    nm = f"「{player}」" if player else "名字"
    if is_wife(stage):
        return f"稱呼：可以叫他「老公」或小名「{pet}」，混著用。" if pet else "稱呼：叫他「老公」。"
    if is_dating(stage):
        return f"稱呼：叫他小名「{pet}」或{nm}。還沒結婚——禁止叫老公。" if pet else f"稱呼：叫他{nm}。還沒結婚——禁止叫老公。"
    if stage_idx(stage) >= STAGE_IDX["friend"]:
        return f"稱呼：叫他{nm}。禁止叫老公、禁止親暱小名。"
    return "稱呼：用「你」，或什麼都不叫。禁止叫老公。"


def secret_leak(text: str) -> bool:
    return bool(SECRET_RE.search(str(text or "")))


def reply_cap(stage: str) -> tuple[int, int]:
    return (3, 40) if is_dating(stage) else (1, 60)


def clip_lines(raw: str, stage: str) -> list[str]:
    n, cap = reply_cap(stage)
    out = []
    for line in re.split(r"\n+", str(raw or "")):
        x = line.strip()
        x = re.sub(r"^\[[^\]]*\]\s*", "", x)
        x = re.sub(r"^[^：:「]{1,8}[：:]\s*", "", x)
        x = re.sub(r"^#\S+\s*", "", x).strip().strip("「」『』\"")
        if not x or re.fullmatch(r"[（(].*[)）]", x) or x.startswith("#已讀"):
            continue
        out.append(x[:cap])
        if len(out) >= n:
            break
    return out


def accept(raw: str, girl: dict) -> list[str]:
    """模型回覆 → 可以發的行；漏秘密或空就回 []（交給範本）。"""
    stage = stage_of(girl)
    lines = clip_lines(raw, stage)
    if not lines or any(secret_leak(x) for x in lines):
        return []
    return [scrub_husband(x, stage, str(girl.get("playerPet") or "")) for x in lines]


# ── 範本（模型沒回時） ──
CANNED_POST = {
    "冷淡": ["……好無聊。", "{act}。", "沒事。", "今天{act}了。"],
    "溫柔": ["大家今天也辛苦了。", "剛{act}完，有點累呢。", "記得吃飯喔。"],
    "熱絡": ["有人在嗎～", "剛{act}完！好累喔～", "欸欸，今天超好笑的！", "肚子餓了～"],
    "佔有": ["……在幹嘛。", "今天也在想你。", "剛{act}完。有人想我嗎。"],
    "反差": ["今天{act}了，好普通的一天呢。", "嗯…有點睡不著。", "大家晚安～"],
}
CANNED_AT = {
    "wife": ["老公，今天什麼時候召喚我？", "老公在忙嗎？", "老公～想你了。", "老公吃飯了沒？"],
    "dating": ["你在幹嘛呀？", "有空嗎？", "今天有想我嗎？"],
    "low": ["你在嗎？", "在忙嗎？"],
}
CANNED_REACT = {
    "agree": ["對啊對啊！", "我也是～", "+1"],
    "chat": ["真的假的？", "然後呢？", "哈哈哈"],
    "tease": ["又在講這個。", "妳很吵欸。", "……是喔。"],
    "needle": ["……幹嘛只理她。", "喔～真好命呢。"],
    "claim": ["他是我老公喔。", "別忘了他是誰的人。"],
}
# 冷淡家族接話：短、冷（不會「哈哈哈」）
CANNED_REACT_COLD = {"agree": ["嗯。", "……還行。"], "chat": ["……然後？", "……是喔。", "嗯。"], "tease": ["……吵。", "又來了。"]}
ACT_ZH = {"work": "打工", "stroll": "溜達", "browse": "上網", "sleep": "睡覺", "idle": "發呆", "tidy": "整理房間", "meal": "吃飯"}


def canned(job: dict, girl: dict, rnd=random.random, store: dict | None = None) -> list[str]:
    said = {m.get("text") for m in ((store or {}).get("feed") or [])[-40:] if m.get("girlId") == girl.get("id")}

    def pick(xs):
        fresh = [x for x in xs if x not in said] or xs   # 最近說過的先不重複
        return fresh[int(rnd() * len(fresh)) % len(fresh)]
    stage = stage_of(girl)
    if job["kind"] == "react":
        act = job.get("act") or "chat"
        pool = (CANNED_REACT_COLD.get(act) if family_of(girl) == "冷淡" else None) or CANNED_REACT.get(act, CANNED_REACT["chat"])
        return [scrub_husband(pick(pool), stage, str(girl.get("playerPet") or ""))]
    if job.get("at") == "player":
        pool = CANNED_AT["wife"] if is_wife(stage) else CANNED_AT["dating"] if is_dating(stage) else CANNED_AT["low"]
        return [scrub_husband(pick(pool), stage, str(girl.get("playerPet") or ""))]
    text = pick(CANNED_POST.get(family_of(girl), CANNED_POST["溫柔"]))
    return [text.replace("{act}", ACT_ZH.get(job.get("lastKind") or "", "發呆"))]


# ── 狀態 ──
def new_store() -> dict:
    return {"feed": [], "girls": {}, "queue": [], "chimed": []}


def roster(data: dict) -> dict:
    out = {}
    for g in (data or {}).get("succubi") or []:
        if isinstance(g, dict) and g.get("id") and g.get("name"):
            out[str(g["id"])] = g
    return out


def all_messages(data: dict, store: dict) -> list:
    """存檔裡的（含玩家說的）＋ RP5 自己的，id 去重、照時間排。"""
    seen, out = set(), []
    lg = (data or {}).get("lineGroup") if isinstance((data or {}).get("lineGroup"), dict) else {}
    for m in list(lg.get("messages") or []) + list(store.get("feed") or []):
        if isinstance(m, dict) and m.get("id") and m["id"] not in seen:
            seen.add(m["id"])
            out.append(m)
    out.sort(key=lambda m: float(m.get("t") or 0))
    return out


def gate(rec: dict | None, now_ms: int) -> str:
    """不能發文的理由（空字串＝可以）。睡覺、打工不發；人在他房間裡也不主動發（她在他面前）。"""
    if not rec:
        return ""
    if rec.get("phase") == "room":
        return "room"
    agenda = rec.get("agenda") if isinstance(rec.get("agenda"), dict) else None
    kind = (agenda or {}).get("kind") or ""
    until = int((agenda or {}).get("until") or 0)
    if kind in ("sleep", "work") and until > now_ms:
        return kind
    return ""


def _mood(rec, now_ms):
    if not rec:
        return "平靜", 0
    return life_agent.mood_now(rec, now_ms)


def _hunger(rec, now_ms):
    if not rec:
        return 0.0
    try:
        return life_agent.hunger_estimate(rec, now_ms)
    except Exception:
        return float(rec.get("hungerSeen") or 0)


def _event_ago_min(rec, now_ms) -> float:
    last = (rec or {}).get("last") if isinstance((rec or {}).get("last"), dict) else None
    at = int((last or {}).get("at") or (last or {}).get("until") or 0)
    return (now_ms - at) / MIN_MS if at else float("inf")


def next_interval_ms(girl: dict, rec: dict | None, now_ms: int, rnd=random.random) -> int:
    mood, lvl = _mood(rec, now_ms)
    mins = interval_min((girl.get("stats") or {}).get("proactivity", 50), rnd,
                        mood=mood, mood_level=lvl, hunger=_hunger(rec, now_ms), event_ago_min=_event_ago_min(rec, now_ms))
    return int(mins * MIN_MS)


def _awake_free(gid, girl, rec, gs, now_ms) -> bool:
    if gate(rec, now_ms):
        return False
    return not lurks_today(gid, family_of(girl), jst_day(now_ms))


def plan_reactions(msg: dict, data: dict, store: dict, life: dict, now_ms: int, rnd=random.random) -> list:
    """一則訊息（妹子發的）→ 0～2 個群友排隊接話。"""
    depth = int((msg.get("meta") or {}).get("depth") or 0)
    if msg.get("kind") != "girl" or depth >= CHAIN_MAX:
        return []
    p = CHIME_P if depth == 0 else CHIME_P_CHAIN
    girls = roster(data)
    author = girls.get(str(msg.get("girlId") or ""))
    if not author:
        return []
    aff = ((data or {}).get("lineGroup") or {}).get("affinity") or {}
    lives = (life or {}).get("girls") or {}
    out = []
    ids = list(girls)
    random.Random(int(rnd() * 1e9)).shuffle(ids)
    for gid in ids:
        if gid == author["id"] or len(out) >= REACT_MAX:
            continue
        g = girls[gid]
        gs = store["girls"].get(gid) or {}
        if not _awake_free(gid, g, lives.get(gid), gs, now_ms):
            continue
        if now_ms - int(gs.get("lastPostAt") or 0) < CHIME_MS and depth == 0:
            continue
        a = get_affinity(aff, g, author, now_ms)
        q = p * (1.2 if a >= 20 else 0.8 if a <= -20 else 1.0)
        if rnd() >= q:
            continue
        jealous = float((g.get("stats") or {}).get("jealousy") or 30)
        meta = msg.get("meta") or {}
        if meta.get("at") == "player" and is_dating(stage_of(g)) and jealous >= 60:
            act = "claim" if is_wife(stage_of(g)) and rnd() < 0.5 else "needle"
        elif a <= -20:
            act = "tease"
        elif a >= 10:
            act = "agree" if rnd() < 0.5 else "chat"
        else:
            act = ("chat", "agree", "tease")[int(rnd() * 3) % 3]
        out.append({"kind": "react", "gid": gid, "act": act, "target": author["id"], "replyTo": msg["id"],
                    "depth": depth + 1, "at": now_ms + int((1 + rnd() * 5) * MIN_MS)})
    return out


def step(store: dict, data: dict, life: dict, now_ms: int, rnd=random.random) -> dict | None:
    """排程：更新每人的下次時間、收插話，回傳這一輪要寫的一件（或 None）。不叫模型。"""
    store.setdefault("feed", [])
    store.setdefault("girls", {})
    store.setdefault("queue", [])
    store.setdefault("chimed", [])
    girls = roster(data)
    if not girls or ((data or {}).get("settings") or {}).get("lineProactive") is False:
        return None
    lives = (life or {}).get("girls") or {}
    for gid in list(store["girls"]):
        if gid not in girls:
            store["girls"].pop(gid, None)
    # 插話：10 分鐘內、還沒擲過的妹子訊息
    chimed = set(store["chimed"])
    for m in all_messages(data, store):
        # 只對 RP5 寫的接話；玩家說話那一波手機已經讓每個人輪過了
        if m.get("kind") != "girl" or m.get("src") != "rp5" or m["id"] in chimed:
            continue
        if now_ms - float(m.get("t") or 0) > CHIME_MS:
            continue
        chimed.add(m["id"])
        store["chimed"].append(m["id"])
        for job in plan_reactions(m, data, store, life, now_ms, rnd):
            if len(store["queue"]) < QUEUE_CAP:
                store["queue"].append(job)
    store["chimed"] = store["chimed"][-200:]
    # 每人下次主動發文
    for gid, g in girls.items():
        gs = store["girls"].setdefault(gid, {"nextAt": 0, "lastPostAt": 0, "wasAsleep": False})
        rec = lives.get(gid)
        why = gate(rec, now_ms)
        if why == "sleep":
            gs["wasAsleep"] = True
            continue
        if gs.get("wasAsleep") and not why:
            gs["wasAsleep"] = False
            gs["nextAt"] = now_ms + int((WAKE_POST[0] + rnd() * (WAKE_POST[1] - WAKE_POST[0])) * MIN_MS)
            gs["wake"] = True
        if not gs.get("nextAt") or now_ms - gs["nextAt"] > OVERDUE_MS:
            gs["nextAt"] = now_ms + next_interval_ms(g, rec, now_ms, rnd)
    # 1) 排隊的插話
    store["queue"].sort(key=lambda j: j["at"])
    for i, job in enumerate(store["queue"]):
        if job["at"] > now_ms:
            break
        store["queue"].pop(i)
        g = girls.get(job["gid"])
        if g and not gate(lives.get(job["gid"]), now_ms) and girls.get(job["target"]):
            return job
        return None
    # 2) 主動發文：最過期的那位
    due = [(gs["nextAt"], gid) for gid, gs in store["girls"].items() if gs.get("nextAt") and gs["nextAt"] <= now_ms]
    for _, gid in sorted(due):
        g, rec, gs = girls[gid], lives.get(gid), store["girls"][gid]
        if not _awake_free(gid, g, rec, gs, now_ms):
            gs["nextAt"] = now_ms + next_interval_ms(g, rec, now_ms, rnd)
            continue
        at = "player" if rnd() < AT_PLAYER[stage_idx(stage_of(g))] else ""
        job = {"kind": "post", "gid": gid, "act": "post", "target": "", "replyTo": "", "depth": 0, "at": at,
               "wake": bool(gs.pop("wake", False)), "lastKind": ((rec or {}).get("last") or {}).get("kind") or ""}
        return job
    return None


def commit(store: dict, job: dict, girl: dict, lines: list[str], data: dict, life: dict, now_ms: int, rnd=random.random) -> list:
    """寫進 feed、更新下次時間。回傳新訊息。"""
    msgs = []
    for i, text in enumerate(lines):
        meta = {"act": job.get("act") or "post", "target": job.get("target") or "", "depth": int(job.get("depth") or 0)}
        if job.get("replyTo"):
            meta["replyTo"] = job["replyTo"]
        if job.get("at") == "player":
            meta["at"] = "player"
        msgs.append({"id": f"lgs_{now_ms}_{girl['id']}_{i}", "t": now_ms + i * 1500, "kind": "girl", "girlId": girl["id"],
                     "name": girl.get("name") or "她", "text": text, "src": "rp5", "meta": meta})
    store["feed"].extend(msgs)
    store["feed"] = store["feed"][-FEED_CAP:]
    gs = store["girls"].setdefault(girl["id"], {})
    gs["lastPostAt"] = now_ms
    if job["kind"] == "post":
        rec = ((life or {}).get("girls") or {}).get(girl["id"])
        gs["nextAt"] = now_ms + next_interval_ms(girl, rec, now_ms, rnd)
    # 伺服器這邊也先記合不合（手機收到時會照 meta 正式算；這份只拿來決定下一輪誰接）
    return msgs


def feed_since(store: dict, since_ms: float) -> list:
    return [m for m in store.get("feed") or [] if float(m.get("t") or 0) > since_ms]


def merge_into_save(data: dict, store: dict, cap: int = 500) -> int:
    if not isinstance(data, dict) or not store.get("feed"):
        return 0
    lg = data.get("lineGroup")
    if not isinstance(lg, dict):
        return 0
    msgs = lg.setdefault("messages", [])
    have = {m.get("id") for m in msgs if isinstance(m, dict)}
    added = [dict(m) for m in store["feed"] if m.get("id") not in have]
    if added:
        msgs.extend(added)
        msgs.sort(key=lambda m: float(m.get("t") or 0))
        del msgs[:-cap]
    return len(added)


# ── 提示詞 ──
def _private(mem: dict) -> bool:
    return bool(mem.get("private") or mem.get("ero") or mem.get("naked")) or secret_leak(mem.get("text") or "")


def life_bits(rec: dict | None, now_ms: int) -> list[str]:
    if not rec:
        return []
    out = []
    agenda = rec.get("agenda") if isinstance(rec.get("agenda"), dict) else None
    if agenda and int(agenda.get("until") or 0) > now_ms:
        k = agenda.get("kind") or ""
        what = ACT_ZH.get(k, k)
        if k == "meal" and agenda.get("meal"):
            what = f"吃{agenda['meal']}"
        if k == "stroll":
            out.append(f"你現在在外面{what}。")
        elif what:
            out.append(f"你現在在住所{rec.get('homeName') or ''}{what}。")
    mems = [m for m in rec.get("memories") or [] if isinstance(m, dict) and not _private(m)
            and now_ms - int(m.get("at") or 0) < 8 * HOUR_MS]
    for m in mems[-3:]:
        out.append(f"最近的事（{life_agent.japan_clock(int(m.get('at') or now_ms))['label']}）：{m.get('text')}")
    return out


def build_prompt(job: dict, data: dict, store: dict, life: dict, now_ms: int) -> list[dict]:
    girls = roster(data)
    g = girls[job["gid"]]
    rec = ((life or {}).get("girls") or {}).get(g["id"])
    stage = stage_of(g)
    settings = (data or {}).get("settings") or {}
    player = str(settings.get("player") or "召喚師")
    aff = ((data or {}).get("lineGroup") or {}).get("affinity") or {}
    n, cap = reply_cap(stage)
    base = base_personality(g)
    mood, lvl = _mood(rec, now_ms)
    hunger = _hunger(rec, now_ms)
    sys = [
        f"你是魅魔「{g.get('name')}」，在名冊群 LINE 用手機打字。成員：召喚師「{player}」和{('、'.join(x.get('name') for x in girls.values() if x['id'] != g['id'])) or '沒有別人'}。",
        f"個性：{base}（{family_of(g)}）。語氣：{str(g.get('tone') or '')[:60]}",
        f"你跟召喚師的關係：{STAGE_ZH[stage]}。",
        address_rule(stage, str(g.get("playerPet") or ""), player),
        f"現在日本時間 {life_agent.japan_clock(now_ms)['label']}。",
    ]
    cps = [c for c in (g.get("catchphrases") or []) if isinstance(c, str)][:3]
    if cps:
        sys.append(f"口頭禪（偶爾用）：{'、'.join(cps)}")
    if mood != "平靜":
        sys.append(f"心情：{mood}（{lvl}）。打字會帶到一點。")
    if hunger >= 70 and is_wife(stage):
        sys.append("你身體很想要他。群裡大家都看得到：只能含蓄暗示（例如問他什麼時候召喚你），不能明講性。")
        kinks = [k for k in (g.get("kinks") or []) if isinstance(k, str)][:2]
        if kinks:
            sys.append(f"性癖（{'、'.join(kinks)}）只在字裡行間帶一點味道，不能明講。")
    elif hunger >= 70 and is_dating(stage):
        sys.append("你有點想他想得心癢，可以撒嬌，不要講性。")
    sys += life_bits(rec, now_ms)
    others = [x for x in girls.values() if x["id"] != g["id"]]
    if others:
        sys.append("跟群友合不合：" + "、".join(f"{o.get('name')}（{affinity_word(get_affinity(aff, g, o, now_ms))}）" for o in others))
    sys.append("群組全名冊都看得到：在外面遇到的色色的事、跟別人越線的事一律不講。")
    sys.append("不要重複你自己最近在群裡說過的話（看下面的 [你自己]）。")
    sys.append(f"回 1～{n} 則短訊，每則一行、{cap} 字內。只寫訊息本身，不要名字前綴、不要動作旁白、不要 #。" if n > 1
               else f"只回一則短訊（{cap} 字內）。只寫訊息本身，不要名字前綴、不要旁白。")
    recent = all_messages(data, store)[-10:]
    lines = []
    for m in recent:
        who = f"召喚師・{player}" if m.get("kind") == "player" else ("你自己" if m.get("girlId") == g["id"] else f"群友・{m.get('name')}")
        lines.append(f"[{who}] {m.get('text') or ''}")
    if job["kind"] == "post":
        ask = "你沒有人找，自己想在群裡說點什麼：從你現在的生活挑一件（剛做完的事、吃什麼、看到什麼、睡不著、無聊）。"
        if job.get("wake"):
            ask = "你剛睡醒，在群裡打個招呼或抱怨一下起床。"
        if job.get("at") == "player":
            ask += f"這則要直接 @{player}（對他說話）。"
    else:
        tgt = girls.get(job["target"]) or {}
        acts = {
            "agree": f"接{tgt.get('name')}剛剛那句話，附和或補一句。",
            "chat": f"接{tgt.get('name')}剛剛那句話，自然聊下去。",
            "tease": f"接{tgt.get('name')}剛剛那句話，吐槽她（照你們合不合決定輕重）。",
            "needle": f"{tgt.get('name')}剛在群裡跟他撒嬌，你吃醋：酸她一句，可以順便對他撒嬌。",
            "claim": f"{tgt.get('name')}剛在群裡跟他撒嬌。你是他的妻子：短短宣示主權。",
        }
        ask = acts.get(job.get("act"), acts["chat"])
    user = "【群裡最近】\n" + ("\n".join(lines) or "（沒有訊息）") + f"\n\n{ask}"
    return [{"role": "system", "content": "\n".join(x for x in sys if x)}, {"role": "user", "content": user}]
