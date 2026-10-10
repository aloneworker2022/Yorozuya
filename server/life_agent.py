"""她人在日本時的生活。RP5 照真實時間走，網頁只看結果。

手機關著也算。一個時段結束就寫下那一件，下一件從當下起算。
不把關掉的那幾個小時壓成一次補完。
離開房間不是直接去打工。選到打工才是四小時。

2026-10-09：下一件由程式擲骰（日本時間＋作息＋心情＋最近做過什麼），不再叫模型選。
睡覺是第四種活動。打工 24 小時內最多兩班、不會在睡覺時段開班；不賺錢（抵房租生活費）。
心情是雙向的：打工／溜達／SCP 的遭遇改心情，心情也改下一趟遭遇的權重。心情隨時間淡回平靜。
模型只把抽到的事寫成 2～4 句；寫不出來用範本。碰到的人記在 met（交友之後重做，這裡不交朋友）。
"""

from __future__ import annotations

import math
import random
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import life_data as D
import life_friends as LF
import escort as ES
import pregnancy as PG

_TOKYO = ZoneInfo("Asia/Tokyo")
_WEEKDAYS = "一二三四五六日"

HOUR_MS = 60 * 60 * 1000
WORK_MS = 4 * HOUR_MS
BROWSE_MS = 30 * 60 * 1000
STROLL_SHORT_MS = 30 * 60 * 1000
SLEEP_MIN_MS = 20 * 60 * 1000
SLEEP_CAP_MS = 11 * HOUR_MS
TEXT_CAP = 180
MET_CAP = 30
MEMORY_CAP = 40

REGIONS = [
    {"id": "hokkaido", "name": "北海道"},
    {"id": "tohoku", "name": "東北"},
    {"id": "kanto", "name": "關東"},
    {"id": "chubu", "name": "中部"},
    {"id": "kinki", "name": "近畿"},
    {"id": "chugoku", "name": "中國地方"},
    {"id": "shikoku", "name": "四國"},
    {"id": "kyushu", "name": "九州"},
]

HOMES = [
    {"id": "station-apartment", "name": "車站步行圈的單人公寓"},
    {"id": "market-flat", "name": "超市樓上的一房"},
    {"id": "work-suite", "name": "公司附近的套房"},
    {"id": "family-room", "name": "親戚空出的和室"},
    {"id": "business-hotel", "name": "月租商務旅館的一間"},
    {"id": "old-block", "name": "老社區裡的兩房公寓"},
    {"id": "river-van", "name": "停在河堤的箱型車"},
    {"id": "bookshop-upstairs", "name": "書店樓上的房間"},
    {"id": "shrine-hut", "name": "神社後面的小屋"},
    {"id": "roof-greenhouse", "name": "屋頂加蓋的溫室"},
    {"id": "platform-room", "name": "廢線月台改的小房間"},
    {"id": "onsen-room", "name": "溫泉街住下來的邊間"},
    {"id": "cafe-attic", "name": "打烊後才能上樓的咖啡店閣樓"},
    {"id": "boat-cabin", "name": "港邊小船的艙房"},
    {"id": "no-plate", "name": "門牌被撕掉的公寓"},
    {"id": "drawn-curtains", "name": "白天也拉著窗簾的房間"},
    {"id": "windowless", "name": "沒有窗戶的地下室"},
    {"id": "many-mirrors", "name": "鏡子很多的空屋"},
    {"id": "closed-inn", "name": "已經不接客人的老旅館一間"},
    {"id": "dark-end", "name": "走廊盡頭、燈總是不亮的那一戶"},
    {"id": "empty-lights", "name": "鄰居說沒人住、夜裡卻有燈的房子"},
    {"id": "phone-rings", "name": "電話有時自己會響的房子"},
]

JOBS = D.JOBS  # 24 份；舊存檔的 16 份 id 都還在

KINDS = ("work", "stroll", "browse", "sleep", "idle", "tidy", "meal")
HOME_KINDS = ("browse", "idle", "tidy", "meal")  # 在住所做的事：平平淡淡、不寫各自的記憶（一天一行）
KIND_ZH = {"work": "打工", "stroll": "溜達", "browse": "上網", "sleep": "睡覺", "idle": "發呆", "tidy": "整理房間", "meal": "吃飯"}


def new_store() -> dict:
    return {"girls": {}}


def duration_ms(kind: str, rnd=None) -> int:
    roll = rnd if rnd is not None else random.random
    if kind == "work":
        return WORK_MS
    if kind == "sleep":
        return HOUR_MS
    if kind == "meal":
        return 30 * 60 * 1000
    if kind in D.HOME_DURATIONS_MIN:
        opts = D.HOME_DURATIONS_MIN[kind]
        return opts[int(float(roll()) * len(opts)) % len(opts)] * 60 * 1000
    return STROLL_SHORT_MS if float(roll()) < 0.5 else HOUR_MS


def parse_choice(text: str) -> str:
    raw = str(text or "")
    if "上網" in raw or "新聞" in raw:
        return "browse"
    if "溜" in raw or "逛" in raw:
        return "stroll"
    if "打工" in raw or "上班" in raw:
        return "work"
    return ""


def clip_keyword(text: str) -> str:
    cleaned = re.sub(r"[「」『』\"“”\n。！？]", " ", str(text or ""))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    word = (cleaned.split(" ")[0] if cleaned else "")[:16]
    return word


def clip_text(text: str, cap: int = TEXT_CAP) -> str:
    chars = list(re.sub(r"\s+", " ", str(text or "")).strip())
    return "".join(chars[:cap])


def japan_clock(now_ms: int) -> dict:
    """日本現在幾點。生活敘事要對得上這個時段，不能把白天寫成深夜。"""
    dt = datetime.fromtimestamp(int(now_ms) / 1000, _TOKYO)
    hour = dt.hour
    month = dt.month
    if hour < 5 or hour >= 23:
        part = "深夜"
    elif hour < 10:
        part = "早晨"
    elif hour < 17:
        part = "白天"
    elif hour < 19:
        part = "傍晚"
    else:
        part = "晚上"
    season = "冬" if month == 12 or month <= 2 else "春" if month <= 5 else "夏" if month <= 8 else "秋"
    label = f"{dt.year}年{dt.month}月{dt.day}日 週{_WEEKDAYS[dt.weekday()]} {dt.hour:02d}:{dt.minute:02d}"
    return {
        "label": label,
        "dayPart": part,
        "season": season,
        "line": f"現在是日本時間{label}，{season}季的{part}。描述必須符合這個時間和季節，不要把{part}寫成別的時段。",
    }


def _ms(value) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 0
    return n if n > 10**11 else 0


def _hobby_names(girl: dict) -> list[str]:
    names = []
    for item in girl.get("hobbies") or []:
        if isinstance(item, str) and item.strip():
            names.append(item.strip())
        elif isinstance(item, dict) and str(item.get("name") or "").strip():
            names.append(str(item["name"]).strip())
        if len(names) >= 4:
            break
    return names


def _home_of(girl: dict) -> dict | None:
    world = girl.get("world") if isinstance(girl.get("world"), dict) else None
    home = world.get("home") if isinstance(world, dict) else None
    if isinstance(home, dict) and home.get("id") and home.get("name"):
        return home
    return None


def _mirror_id(mirror: dict) -> str:
    girl = mirror.get("girl") if isinstance(mirror.get("girl"), dict) else {}
    return str(girl.get("gameGirlId") or girl.get("id") or mirror.get("girlId") or "")


def _blank(gid: str) -> dict:
    return {
        "id": gid,
        "name": "",
        "phase": "",
        "visitUntil": 0,
        "regionId": "",
        "regionName": "",
        "homeId": "",
        "homeName": "",
        "job": None,
        "hobbies": [],
        "mood": "",
        "moodLevel": 0,
        "moodAt": 0,
        "moodWhy": "",
        "chrono": "",
        "archetype": "",
        "tone": "",
        "groundId": "",
        "groundName": "",
        "spots": {},
        "agenda": None,
        "history": [],
        "workLog": [],
        "scpSteps": {},
        "met": [],
        "anonSex": 0,
        "hungerRelief": 0,
        "hungerReliefTaken": 0,
        "loyaltyLoss": 0,
        "traceSeq": 0,
        "traces": [],
        "lastAffair": None,
        "nakedKeys": [],
        "last": None,
        "memories": [],
        "notedHome": False,
        "note": "",
    }


MEMORY_KINDS = ("home", "work", "stroll", "browse", "sleep", "life")


def _remember(rec: dict, kind: str, text: str, now_ms: int, keys: list | None = None, extra: dict | None = None) -> dict | None:
    extra = extra or {}
    item = {
        "id": f"la{now_ms}{len(rec.get('memories') or [])}",
        "at": now_ms,
        "kind": kind if kind in MEMORY_KINDS else "life",
        "text": clip_text(text),
        "keys": [],
        "place": str(extra.get("place") or rec.get("homeName") or ""),
        "job": (rec.get("job") or {}).get("name") or "" if kind == "work" else str(extra.get("job") or ""),
        "person": str(extra.get("person") or ""),
        "mood": rec.get("mood") or "",
    }
    for key in ("personRole", "personGender", "personId", "moodBefore", "moodAfter", "tone", "act", "scp", "scpStep", "ero", "eroStep", "private", "bond", "bondFrom", "naked"):
        if extra.get(key) not in (None, ""):
            item[key] = extra[key]
    for k in (keys or []):
        k = str(k or "").strip()
        if k and len(k) <= 24 and k not in item["keys"] and len(item["keys"]) < 8:
            item["keys"].append(k)
    if not item["text"]:
        return None
    rec.setdefault("memories", [])
    if any(isinstance(x, dict) and x.get("text") == item["text"] for x in rec["memories"][-6:]):
        return None
    rec["memories"].append(item)
    rec["memories"] = rec["memories"][-MEMORY_CAP:]
    return item


def _give_home(rec: dict, rnd) -> None:
    region = REGIONS[int(float(rnd()) * len(REGIONS)) % len(REGIONS)]
    home = HOMES[int(float(rnd()) * len(HOMES)) % len(HOMES)]
    rec["regionId"] = region["id"]
    rec["regionName"] = region["name"]
    rec["homeId"] = home["id"]
    rec["homeName"] = home["name"]


def _enter_japan(rec: dict, now_ms: int, rnd) -> None:
    rec["phase"] = "japan"
    rec["agenda"] = None
    if not rec.get("homeId"):
        _give_home(rec, rnd)
    if not rec.get("notedHome"):
        home = rec.get("homeName") or ""
        _remember(
            rec,
            "home",
            f"離開房間，回到住所{home}。" if home else "離開房間，回到住所。",
            now_ms,
            ["住所", home],
        )
        rec["notedHome"] = True


def absorb(store: dict, data: dict, now_ms: int, rnd=None) -> None:
    """讀手機存檔，只收下『人在不在房間、住哪』。不採用手機寫的行程。"""
    roll = rnd if rnd is not None else random.random
    if not isinstance(store, dict):
        return
    store.setdefault("girls", {})
    girls = {}
    for girl in data.get("succubi") or []:
        if isinstance(girl, dict) and girl.get("id"):
            girls[str(girl["id"])] = girl
    mirror = data.get("roomMirror") if isinstance(data.get("roomMirror"), dict) else {}
    present = mirror.get("present") is True
    present_id = _mirror_id(mirror) if present else ""
    mirror_girl = mirror.get("girl") if isinstance(mirror.get("girl"), dict) else {}
    visit_until = _ms(mirror_girl.get("roomVisitUntil")) if present else 0

    for gid in list(store["girls"]):
        if gid not in girls:
            store["girls"].pop(gid, None)

    for gid, girl in girls.items():
        home = _home_of(girl)
        world = girl.get("world") if isinstance(girl.get("world"), dict) else {}
        rec = store["girls"].get(gid)
        known = rec is not None
        if rec is None:
            if not home and gid != present_id:
                continue
            rec = _blank(gid)
            store["girls"][gid] = rec
        rec["name"] = str(girl.get("name") or rec.get("name") or "她")
        rec["hobbies"] = _hobby_names(girl)
        chrono = girl.get("chrono") if isinstance(girl.get("chrono"), dict) else {}
        rec["chrono"] = str(chrono.get("name") or rec.get("chrono") or "")
        rec["archetype"] = str(girl.get("archetype") or rec.get("archetype") or "")
        rec["tone"] = str(girl.get("tone") or rec.get("tone") or "")[:80]
        lib = girl.get("libido") if isinstance(girl.get("libido"), dict) else {}
        rec["libido"] = str(lib.get("grade") or rec.get("libido") or "R").upper()
        # 人在房裡那位：房間鏡像比名冊新（身體、關係、忠誠都看它）
        mine = mirror_girl if (mirror_girl and _mirror_id(mirror) == gid) else None
        src = mine if (mine and present) else girl
        body = src.get("bodyState") if isinstance(src.get("bodyState"), dict) else {}
        if not body and src is not girl and isinstance(girl.get("bodyState"), dict):
            body = girl["bodyState"]
        PG.absorb_phone(rec, body)
        od = body.get("organDev") if isinstance(body.get("organDev"), dict) else {}
        if isinstance(od.get("counts"), dict):
            rec["fuckedSeen"] = int(_num(od["counts"].get("sex"), 0))
        hung = body.get("hunger") if isinstance(body.get("hunger"), dict) else None
        if hung:
            _take_phone_hunger(rec, hung)
        rec["stage"] = str(src.get("stage") or girl.get("roomStage") or girl.get("stage") or rec.get("stage") or "stranger")
        stats = src.get("stats") if isinstance(src.get("stats"), dict) else (girl.get("stats") if isinstance(girl.get("stats"), dict) else {})
        if stats.get("loyalty") is not None:
            rec["loyaltySeen"] = _num(stats.get("loyalty"), 60)
            rec["loyaltyTaken"] = int(_num(stats.get("lifeLoyaltyTaken"), 0))
        ground = world.get("ground") if isinstance(world.get("ground"), dict) else None
        if ground and ground.get("id"):
            rec["groundId"] = str(ground.get("id") or "")
            rec["groundName"] = str(ground.get("name") or "")
            spots = ground.get("spots") if isinstance(ground.get("spots"), dict) else {}
            rec["spots"] = {str(k): str(v) for k, v in spots.items() if v}
        # 心情：人在房裡（或剛從房裡出來）時手機是真相；人在日本時 RP5 是真相，不吃手機的舊值。
        if rec.get("phase") != "japan":
            _take_phone_mood(rec, world, now_ms)
        elif rec.get("mood") not in ("", "平靜") and not _ms(rec.get("moodAt")):
            rec["moodAt"] = now_ms  # 舊紀錄只有字：從現在開始淡
        if home:
            rec["homeId"] = str(home.get("id") or "")
            rec["homeName"] = str(home.get("name") or "")
            if world.get("regionId"):
                rec["regionId"] = str(world.get("regionId") or "")
        job = world.get("job") if isinstance(world.get("job"), dict) else None
        if job and job.get("name") and not (rec.get("job") or {}).get("name"):
            rec["job"] = {"id": str(job.get("id") or ""), "name": str(job["name"])}
        naked_key = _naked_key(world, mine)
        stay_open = gid == present_id and visit_until > now_ms
        no_deadline_yet = gid == present_id and visit_until == 0 and rec.get("phase") != "japan"
        if stay_open or no_deadline_yet:
            rec["phase"] = "room"
            if visit_until:
                rec["visitUntil"] = visit_until
            rec["agenda"] = None
            rec["notedHome"] = False
            continue
        just_left = gid == present_id or (known and rec.get("phase") == "room") or not known
        if just_left and rec.get("phase") != "japan":
            _enter_japan(rec, now_ms, roll)
            # 手機沒送出就關掉、停留到期由 RP5 帶走：房間鏡像裡還是全裸，也算
            if not naked_key and gid == present_id and _undress_stage(mirror_girl) >= 3:
                naked_key = f"v{visit_until or now_ms}"
        if naked_key and rec.get("phase") == "japan":
            start_naked(rec, naked_key, now_ms, roll)
        elif rec.get("phase") != "japan" or not rec.get("homeId"):
            _enter_japan(rec, now_ms, roll)
        else:
            rec["phase"] = "japan"
        # 接客還債：手機帶她出門時打的旗（world.escortGo {key, at, debt}），同一個 key 只開一班
        go = _escort_flag(world, mine)
        if go and rec.get("phase") == "japan":
            start_escort(rec, int(_num(go.get("debt"), 0)), now_ms, roll, key=str(go["key"]))


# ───────────────────────── 心情 ─────────────────────────
# level 0～100。隨時間淡回平靜（惰性計算），低於 MOOD_CLEAR 就是平靜。手機 life_schedule.js 的 outsideMoodNow 跟這裡同一套。
MOOD_CLEAR = 12
MOOD_DECAY_PER_HOUR = {"愉快": 5, "不悅": 5, "低落": 4, "不安": 5, "虛脫": 15, "臉紅心跳": 6, "心虛": 4}
MOOD_DEFAULT_LEVEL = 40  # 舊存檔只有字、沒有強度


def _num(value, default=0.0) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    return n if math.isfinite(n) else default


def mood_now(rec: dict, now_ms: int) -> tuple[str, int]:
    name = str(rec.get("mood") or "平靜")
    if name not in D.MOODS or name == "平靜":
        return "平靜", 0
    level = _num(rec.get("moodLevel"), 0) or MOOD_DEFAULT_LEVEL
    at = _ms(rec.get("moodAt")) or now_ms
    hours = max(0.0, (now_ms - at) / HOUR_MS)
    level = level - hours * MOOD_DECAY_PER_HOUR.get(name, 5)
    if level < MOOD_CLEAR:
        return "平靜", 0
    return name, int(round(min(100, level)))


def _write_mood(rec: dict, name: str, level: float, why: str, now_ms: int) -> None:
    if name == "平靜" or level < MOOD_CLEAR:
        rec["mood"], rec["moodLevel"], rec["moodWhy"] = "平靜", 0, ""
    else:
        rec["mood"], rec["moodLevel"] = name, int(round(min(100, level)))
        rec["moodWhy"] = clip_text(why, 40)
    rec["moodAt"] = now_ms


def apply_mood(rec: dict, name: str, level: float, why: str, now_ms: int) -> tuple[str, int]:
    """把一件事的結果疊到現在的心情上。平靜＝把現在的心情往下壓。"""
    cur, cl = mood_now(rec, now_ms)
    why_now = rec.get("moodWhy") or ""
    level = max(0.0, float(level))
    if name not in D.MOODS:
        name = "平靜"
    if name == "平靜":
        _write_mood(rec, cur, cl - level, why_now, now_ms)
    elif cur == name:
        _write_mood(rec, name, max(cl, level) + 0.4 * min(cl, level), why or why_now, now_ms)
    elif cur == "平靜" or level >= cl * 0.7:
        _write_mood(rec, name, level, why, now_ms)
    else:
        _write_mood(rec, cur, cl - level * 0.3, why_now, now_ms)
    return mood_now(rec, now_ms)


def _take_phone_mood(rec: dict, world: dict, now_ms: int) -> None:
    name = str(world.get("mood") or "")
    if name not in D.MOODS:
        rec["mood"], rec["moodLevel"], rec["moodAt"], rec["moodWhy"] = "平靜", 0, now_ms, ""
        return
    rec["mood"] = name
    rec["moodLevel"] = int(_num(world.get("moodLevel"), 0)) or (0 if name == "平靜" else MOOD_DEFAULT_LEVEL)
    rec["moodAt"] = _ms(world.get("moodAt")) or now_ms
    rec["moodWhy"] = str(world.get("moodWhy") or "")[:40]


def _mood_mult(table: dict, mood: str, level: int, key: str) -> float:
    """心情越強，倍率越接近表上的數字；level 60 以上用滿。"""
    m = (table.get(mood) or {}).get(key, 1.0)
    k = min(1.0, max(0.0, level / 60))
    return 1.0 + (m - 1.0) * k


# ───────────────────────── 作息 ─────────────────────────
# 日本時間的睡覺時段（小時，可跨午夜）。愛睡午覺多一段 13～15 點午覺。
SLEEP_WINDOWS = {
    "早起型": [(21.5, 5.5)],
    "夜貓子": [(3.5, 11.5)],
    "愛睡午覺": [(0.5, 7.5), (13.0, 15.0)],
    "淺眠易怒": [(1.0, 7.0)],
    "隨和好睡": [(23.5, 8.0)],
    "": [(0.5, 7.5)],
}
BED_EARLY_MS = 30 * 60 * 1000   # 離睡覺時段 30 分內就直接去睡
WORK_LEAD_MS = 3 * HOUR_MS      # 離睡覺不到 3 小時不開四小時的班（最多吃掉 1 小時睡眠）
STROLL_LONG_LEAD_MS = HOUR_MS
WORK_PER_DAY = 2                # 24 小時內最多兩班（第二班權重很低，大多一天一班）
STROLL_PER_DAY = 3              # 24 小時內最多溜達三次
MEAL_GAP_MS = int(2.5 * HOUR_MS)
TIDY_GAP_MS = 20 * HOUR_MS


def _tokyo(now_ms: int) -> datetime:
    return datetime.fromtimestamp(int(now_ms) / 1000, _TOKYO)


def jst_hour(now_ms: int) -> float:
    dt = _tokyo(now_ms)
    return dt.hour + dt.minute / 60


def _at_hour(dt: datetime, hour: float) -> datetime:
    h = int(hour) % 24
    m = int(round((hour - int(hour)) * 60))
    return dt.replace(hour=h, minute=m, second=0, microsecond=0)


def _inside(h: float, s: float, e: float) -> bool:
    return s <= h < e if s < e else (h >= s or h < e)


def sleep_info(chrono: str, now_ms: int) -> dict:
    wins = SLEEP_WINDOWS.get(chrono) or SLEEP_WINDOWS[""]
    dt = _tokyo(now_ms)
    h = dt.hour + dt.minute / 60 + dt.second / 3600
    wake = None
    nap = False
    nxt = None
    for i, (s, e) in enumerate(wins):
        if _inside(h, s, e):
            end = _at_hour(dt, e)
            if end <= dt:
                end += timedelta(days=1)
            if wake is None or end > wake:
                wake, nap = end, i > 0
        start = _at_hour(dt, s)
        if start <= dt:
            start += timedelta(days=1)
        if nxt is None or start < nxt:
            nxt = start
    return {
        "asleep": wake is not None,
        "wakeAt": int(wake.timestamp() * 1000) if wake else 0,
        "nextSleepAt": int(nxt.timestamp() * 1000) if nxt else 0,
        "nap": nap,
    }


def liveliness(chrono: str, h: float) -> float:
    if chrono == "夜貓子":
        return 1.6 if (h >= 20 or h < 3) else 0.6 if h < 14 else 1.0
    if chrono == "早起型":
        return 1.6 if 5.5 <= h < 11 else 0.5 if h >= 19 else 1.0
    return 0.6 if (h < 6 or h >= 23) else 1.0


def job_fit(job: dict | None, h: float) -> float:
    band = (job or {}).get("band") or _job_band((job or {}).get("id"))
    if band == "night":
        return 1.6 if (h >= 17 or h < 2) else 0.3
    if band == "day":
        return 1.4 if 8 <= h < 19 else 0.25
    return 0.5 if 1 <= h < 6 else 1.0


def _job_band(job_id) -> str:
    for job in D.JOBS:
        if job["id"] == job_id:
            return job["band"]
    return "any"


def _job_tone(job_id) -> str:
    for job in D.JOBS:
        if job["id"] == job_id:
            return job["tone"]
    return "normal"


def shifts_in_day(rec: dict, now_ms: int) -> int:
    return sum(1 for t in (rec.get("workLog") or []) if 0 <= now_ms - _ms(t) < 24 * HOUR_MS)


MOOD_CHOICE = {
    "愉快": {"stroll": 1.5, "tidy": 1.3, "idle": 0.8},
    "不悅": {"stroll": 1.2, "tidy": 1.4, "work": 0.85},
    "低落": {"idle": 1.6, "browse": 1.2, "stroll": 0.7, "work": 0.8, "tidy": 0.6},
    "不安": {"browse": 1.5, "idle": 1.3, "stroll": 0.5},
    "虛脫": {"idle": 2.0, "browse": 1.3, "stroll": 0.4, "work": 0.25, "tidy": 0.3},
    "臉紅心跳": {"stroll": 1.2, "idle": 1.2},
}
OUTDOOR_RE = re.compile(r"散步|攝影|拍照|旅行|運動|跑步|登山|釣|逛|美食|咖啡|購物|花|貓|狗")
INDOOR_RE = re.compile(r"遊戲|電玩|動漫|漫畫|網|追劇|小說|閱讀|書|音樂|天文|占卜")
BASE_WEIGHTS = {"work": 0.0, "stroll": 1.5, "browse": 2.0, "idle": 2.4, "tidy": 0.9}
WORK_FIRST, WORK_SECOND = 4.5, 0.15


def _count_in(log, now_ms: int, span_ms: int) -> int:
    return sum(1 for t in (log or []) if 0 <= now_ms - _ms(t) < span_ms)


def choice_weights(rec: dict, now_ms: int) -> dict:
    """醒著時的權重。睡覺、吃飯不在這裡：到點就去（pick_next）。在家的事佔大部分。"""
    h = jst_hour(now_ms)
    mood, level = mood_now(rec, now_ms)
    info = sleep_info(rec.get("chrono") or "", now_ms)
    to_sleep = info["nextSleepAt"] - now_ms
    hist = [k for k in (rec.get("history") or []) if k in KINDS]
    last = hist[-1] if hist else ""
    w = dict(BASE_WEIGHTS)
    shifts = shifts_in_day(rec, now_ms)
    if to_sleep >= WORK_LEAD_MS and last != "work" and shifts < WORK_PER_DAY:
        w["work"] = (WORK_FIRST if shifts == 0 else WORK_SECOND) * job_fit(_job_of(rec), h)
    w["stroll"] *= liveliness(rec.get("chrono") or "", h)
    strolls = _count_in(rec.get("strollLog"), now_ms, 24 * HOUR_MS)
    w["stroll"] *= 0.0 if strolls >= STROLL_PER_DAY else 0.35 if strolls == 2 else 0.7 if strolls == 1 else 1.0
    if 0 <= now_ms - _ms(rec.get("tidyAt")) < TIDY_GAP_MS:
        w["tidy"] *= 0.1
    if h < 5 or h >= 23:
        w["stroll"] *= 0.7
        w["browse"] *= 1.3
        w["idle"] *= 1.2
        w["tidy"] *= 0.3
    for kind in ("stroll", "browse", "tidy"):
        if last == kind:
            w[kind] *= 0.4
            if len(hist) >= 2 and hist[-2] == kind:
                w[kind] *= 0.5
    if last == "idle":
        w["idle"] *= 0.6
    for kind in w:
        w[kind] *= _mood_mult(MOOD_CHOICE, mood, level, kind)
    hobbies = "、".join(rec.get("hobbies") or [])
    if OUTDOOR_RE.search(hobbies):
        w["stroll"] *= 1.15
    if INDOOR_RE.search(hobbies):
        w["browse"] *= 1.15
    return {k: round(v, 4) for k, v in w.items()}


def meal_due(rec: dict, now_ms: int) -> int:
    """現在在哪一餐的時段、而且 2.5 小時內沒吃過 → 回 0／1／2；不是 → -1。"""
    if 0 <= now_ms - _ms(rec.get("lastMealAt")) < MEAL_GAP_MS:
        return -1
    h = jst_hour(now_ms)
    times = D.MEAL_TIMES.get(rec.get("chrono") or "") or D.MEAL_TIMES[""]
    for i, t in enumerate(times):
        if _inside(h, (t - 0.5) % 24, (t + 1.5) % 24):
            return i
    return -1


def _job_of(rec: dict) -> dict | None:
    job = rec.get("job") if isinstance(rec.get("job"), dict) else None
    if job and job.get("name"):
        return {"id": job.get("id") or "", "name": job["name"], "band": _job_band(job.get("id"))}
    return None


def _pick_weighted(weights: dict, rnd) -> str:
    total = sum(v for v in weights.values() if v > 0)
    if total <= 0:
        return ""
    roll = float(rnd()) * total
    for key, v in weights.items():
        if v <= 0:
            continue
        roll -= v
        if roll < 0:
            return key
    return [k for k, v in weights.items() if v > 0][-1]


def pick_next(rec: dict, now_ms: int, rnd=None) -> tuple[str, int]:
    """下一件做什麼、做多久。取代手機上沒人呼叫的 nextAgendaKind。"""
    roll = rnd if rnd is not None else random.random
    chrono = rec.get("chrono") or ""
    info = sleep_info(chrono, now_ms)
    if info["asleep"] and info["wakeAt"] - now_ms >= SLEEP_MIN_MS:
        return "sleep", min(SLEEP_CAP_MS, info["wakeAt"] - now_ms)
    to_sleep = info["nextSleepAt"] - now_ms
    if to_sleep <= BED_EARLY_MS:
        wake = sleep_info(chrono, info["nextSleepAt"] + 60 * 1000)["wakeAt"]
        if wake - now_ms >= SLEEP_MIN_MS:
            return "sleep", min(SLEEP_CAP_MS, wake - now_ms)
    slot = meal_due(rec, now_ms)
    if slot >= 0:
        return "meal", D.MEAL_MIN[slot] * 60 * 1000
    kind = _pick_weighted(choice_weights(rec, now_ms), roll) or "idle"
    if kind == "work":
        return kind, WORK_MS
    if kind in D.HOME_DURATIONS_MIN:
        ms = duration_ms(kind, roll)
        # 不要拖過睡覺時間
        return kind, max(30 * 60 * 1000, min(ms, to_sleep)) if to_sleep > 0 else ms
    if to_sleep < STROLL_LONG_LEAD_MS:
        return kind, STROLL_SHORT_MS
    return kind, STROLL_SHORT_MS if float(roll()) < 0.5 else HOUR_MS


def needs_choice(rec: dict) -> bool:
    if rec.get("phase") != "japan" or not rec.get("homeId"):
        return False
    agenda = rec.get("agenda") if isinstance(rec.get("agenda"), dict) else None
    return not agenda or not _ms(agenda.get("until"))


def is_due(rec: dict, now_ms: int) -> bool:
    if rec.get("phase") != "japan":
        return False
    agenda = rec.get("agenda") if isinstance(rec.get("agenda"), dict) else None
    until = _ms(agenda.get("until")) if agenda else 0
    return bool(until) and now_ms >= until


def arm(rec: dict, kind: str, now_ms: int, rnd=None, ms: int | None = None) -> dict:
    kind = kind if kind in KINDS else "stroll"
    if ms is None:
        if kind == "sleep":
            info = sleep_info(rec.get("chrono") or "", now_ms)
            ms = min(SLEEP_CAP_MS, info["wakeAt"] - now_ms) if info["asleep"] and info["wakeAt"] - now_ms >= SLEEP_MIN_MS else HOUR_MS
        else:
            ms = duration_ms(kind, rnd)
    rec["agenda"] = {"kind": kind, "until": now_ms + int(ms), "startedAt": now_ms}
    if kind == "meal":
        slot = meal_due(rec, now_ms)
        names = D.MEAL_NAMES_BY_CHRONO.get(rec.get("chrono") or "") or D.MEAL_NAMES
        rec["agenda"]["meal"] = names[slot] if slot >= 0 else D.NIGHT_SNACK
        rec["lastMealAt"] = now_ms
    elif kind == "stroll":
        rec["strollLog"] = ([t for t in (rec.get("strollLog") or []) if now_ms - _ms(t) < 48 * HOUR_MS] + [now_ms])[-8:]
    elif kind == "tidy":
        rec["tidyAt"] = now_ms
    elif kind == "sleep" and ms >= 3 * HOUR_MS:
        write_home_day(rec, now_ms)
    if kind == "work":
        ensure_job(rec, rnd)
        log = [t for t in (rec.get("workLog") or []) if now_ms - _ms(t) < 48 * HOUR_MS]
        log.append(now_ms)
        rec["workLog"] = log[-6:]
    mins = int(round(ms / 60000))
    span = f"{mins // 60}小時{mins % 60}分" if mins >= 60 and mins % 60 else (f"{mins // 60}小時" if mins >= 60 else f"{mins}分鐘")
    rec["note"] = f"{rec.get('name') or '她'}去{KIND_ZH[kind]}，這趟{span}。"
    return rec["agenda"]


def apply_choice(store: dict, gid: str, kind: str, now_ms: int, rnd=None) -> bool:
    """kind 空白＝照規則擲（pick_next）；有給＝沙盒手動指定。"""
    rec = (store.get("girls") or {}).get(gid)
    if not rec or rec.get("phase") != "japan" or not needs_choice(rec):
        return False
    if kind in KINDS:
        arm(rec, kind, now_ms, rnd)
    else:
        nk, ms = pick_next(rec, now_ms, rnd)
        arm(rec, nk, now_ms, rnd, ms)
    return True


def ensure_job(rec: dict, rnd=None) -> dict:
    """第一次打工才抽。普通 3：少見 2：詭異 1，再依作息偏夜班或白天班。之後固定同一份。"""
    if (rec.get("job") or {}).get("name"):
        return rec["job"]
    roll = rnd if rnd is not None else random.random
    chrono = rec.get("chrono") or ""
    weights = {}
    for job in D.JOBS:
        w = D.JOB_TONE_WEIGHT[job["tone"]]
        if chrono == "夜貓子":
            w *= 2.0 if job["band"] == "night" else 0.6 if job["band"] == "day" else 1.0
        elif chrono == "早起型":
            w *= 2.0 if job["band"] == "day" else 0.3 if job["band"] == "night" else 1.0
        weights[job["id"]] = w
    jid = _pick_weighted(weights, roll) or D.JOBS[0]["id"]
    job = next(j for j in D.JOBS if j["id"] == jid)
    rec["job"] = {"id": job["id"], "name": job["name"]}
    return rec["job"]


# ───────────────────────── 遭遇 ─────────────────────────
# 心情 → 遭遇的倍率（level 60 以上用滿）。反過來遭遇的結果在 _outcome 改心情。
MOOD_EMOTION = {
    "愉快": {"joy": 1.5, "delight": 1.5, "anger": 0.7, "sorrow": 0.7},
    "不悅": {"anger": 1.8, "joy": 0.7, "delight": 0.8},
    "低落": {"sorrow": 1.8, "delight": 0.7, "joy": 0.8},
    "不安": {"sorrow": 1.3, "anger": 1.2, "delight": 0.8},
    "虛脫": {"anger": 1.3, "sorrow": 1.2},
    "臉紅心跳": {"joy": 1.2, "delight": 1.2},
}
MOOD_ACT = {
    "愉快": {"chat": 1.6, "help": 1.4, "contact": 1.5, "greet": 1.5, "argue": 0.5, "blame": 0.6},
    "不悅": {"argue": 2.0, "blame": 1.5, "help": 0.6, "chat": 0.7},
    "低落": {"quiet": 2.0, "blame": 1.4, "chat": 0.6, "contact": 0.6},
    "不安": {"quiet": 1.5, "glance": 1.3, "stare": 1.5, "follow": 1.4},
    "虛脫": {"blame": 1.6, "quiet": 1.4, "help": 1.2},
}
MOOD_TONE = {  # 日常：奇遇：詭異（基準 3：2：1）
    "愉快": {"daily": 1.0, "wonder": 1.75, "horror": 0.5},
    "不悅": {"daily": 1.0, "wonder": 0.75, "horror": 1.5},
    "低落": {"daily": 1.0, "wonder": 0.6, "horror": 2.0},
    "不安": {"daily": 0.85, "wonder": 0.5, "horror": 2.5},
    "虛脫": {"daily": 1.15, "wonder": 0.5, "horror": 1.5},
}
MOOD_SCP = {"不安": 2.0, "低落": 1.5, "虛脫": 1.3, "愉快": 0.6}
MOOD_ERO = {"不安": 0.4, "低落": 0.7, "虛脫": 0.5, "不悅": 0.8, "愉快": 1.2, "臉紅心跳": 1.4}
LIBIDO_ERO = {"N": 0.6, "R": 0.8, "S": 1.0, "SS": 1.25, "SSR": 1.5}      # 看到的機率
LIBIDO_HUNGER = {"N": 0.8, "R": 1.0, "S": 1.1, "SS": 1.2, "SSR": 1.3}    # 漲多少飢渴
ERO_FIRST_CAP = 0.2
ERO_NEXT_CAP = 0.5
ERO_GAP_MS = 24 * HOUR_MS          # 同一人兩步之間至少一天，再加 0～1 天亂數
ERO_GAP_SPREAD_MS = 24 * HOUR_MS
MOOD_PERSON = {"愉快": 1.2, "低落": 0.7, "不安": 0.7, "虛脫": 0.8}
PERSON_BASE = 0.5
REVISIT = {"同事": 0.75, "顧客": 0.35, "路人": 0.25}  # 2026-10-10 交友線加快（原 0.55／0.15／0.12）
SCP_FIRST_CAP = 0.25
SCP_NEXT_CAP = 0.6
# 兩步之間至少隔 2 天，再加 0～2 天亂數（2026-10-10 使用者嫌太少：一週大概看到幾步）。舊的 10 天紀錄照新規則算。
SCP_GAP_MS = 2 * 24 * HOUR_MS
SCP_GAP_SPREAD_MS = 2 * 24 * HOUR_MS


def _pick(items: list, rnd):
    return items[int(float(rnd()) * len(items)) % len(items)]


def _pick_by(items: list, table: dict, mood: str, level: int, rnd, base_key: str = "") -> dict:
    weights = {}
    for item in items:
        base = float(item.get(base_key) or 1) if base_key else 1.0
        weights[item["id"]] = base * _mood_mult(table, mood, level, item["id"])
    pid = _pick_weighted(weights, rnd)
    return next(i for i in items if i["id"] == pid)


def scp_chance(started: bool, mood: str, level: int, eerie: bool = False, night: bool = False) -> float:
    base = D.SCP_NEXT_CHANCE if started else D.SCP_FIRST_CHANCE
    mult = 1.0 + (MOOD_SCP.get(mood, 1.0) - 1.0) * min(1.0, level / 60)
    if eerie:
        mult *= 1.5
    if night:
        mult *= 1.3
    return min(SCP_NEXT_CAP if started else SCP_FIRST_CAP, base * mult)


def roll_scp(rec: dict, where: str, mood: str, level: int, rnd, eerie: bool = False, night: bool = False, now_ms: int = 0) -> dict | None:
    """where = work（打工場所）或 stroll（綁在她落腳的真實地點）。已經開始的那件優先，再遇到就進下一步。"""
    if now_ms and now_ms < _gate(rec, "scp"):
        return None
    steps = rec.get("scpSteps") or {}
    if where == "work":
        pool = [e for e in D.SCP_EVENTS if e.get("work")]
    else:
        gid = rec.get("groundId") or ""
        pool = [e for e in D.SCP_EVENTS if e.get("generic") or (gid and gid in (e.get("grounds") or []))]
    open_ = [(e, int(steps.get(e["id"]) or 0)) for e in pool if int(steps.get(e["id"]) or 0) < len(e["stages"])]
    started = [x for x in open_ if x[1] > 0]
    use = started or open_
    if not use:
        return None
    if not float(rnd()) < scp_chance(bool(started), mood, level, eerie, night):
        return None
    event, step = _pick(use, rnd)
    return {"id": event["id"], "code": event["code"], "title": event["title"], "step": step, "feel": event.get("feel") or "horror",
            "of": len(event["stages"]), "stage": event["stages"][step], "prior": event["stages"][:step]}


def _gate(rec: dict, key: str) -> int:
    """下一步最早什麼時候可以發生。有 <key>NextAt 用它；舊紀錄只有 <key>At 就用最短間隔。"""
    nxt = _ms(rec.get(f"{key}NextAt"))
    if nxt:
        return nxt
    at = _ms(rec.get(f"{key}At"))
    return at + (SCP_GAP_MS if key == "scp" else ERO_GAP_MS) if at else 0


def libido_grade(rec: dict) -> str:
    g = str(rec.get("libido") or "R").upper()
    return g if g in LIBIDO_ERO else "R"


# 飢渴：真相在手機 bodyState.hunger。RP5 留一份同步副本 hungerEst {level, at}（手機 hunger.js 同一套漲法），
# 只拿來算機率。手機每存一次比較新的值就整個換掉；RP5 自己給的（奇遇 +、外面做愛 −）先寫進副本，
# 再累計到 hungerGiven／hungerRelief，手機用 lifeTaken／lifeReliefTaken 記收過多少，差額才動真值（不會重複算）。
HUNGER_RATE = {"N": 1.2, "R": 1.8, "S": 2.5, "SS": 3.3, "SSR": 4.2}
HUNGER_STAGE_MULT = {"reserved": 1, "friend": 1.35, "dating": 1.5, "wife": 1.6}


def _take_phone_hunger(rec: dict, hung: dict) -> None:
    at = _ms(hung.get("at"))
    rec["hungerSeen"] = float(hung.get("level") or 0)
    rec["hungerTaken"] = int(hung.get("lifeTaken") or 0)
    rec["hungerReliefTaken"] = int(hung.get("lifeReliefTaken") or 0)
    rec["hungerSated"] = _ms(hung.get("satedUntil"))
    if at and at >= _ms(rec.get("hungerSyncAt")):
        pending = (int(rec.get("hungerGiven") or 0) - rec["hungerTaken"]) - (int(rec.get("hungerRelief") or 0) - rec["hungerReliefTaken"])
        rec["hungerEst"] = {"level": max(0.0, min(100.0, rec["hungerSeen"] + pending)), "at": at}
        rec["hungerSyncAt"] = at


def hunger_estimate(rec: dict, now_ms: int = 0) -> float:
    """現在大概多飢渴（0～100）。只拿來算機率，不是真相。"""
    est = rec.get("hungerEst") if isinstance(rec.get("hungerEst"), dict) else None
    if not est or not now_ms:
        seen = float(rec.get("hungerSeen") or 0)
        pending = (int(rec.get("hungerGiven") or 0) - int(rec.get("hungerTaken") or 0)) - \
                  (int(rec.get("hungerRelief") or 0) - int(rec.get("hungerReliefTaken") or 0))
        if not est:
            return max(0.0, min(100.0, seen + pending))
        return max(0.0, min(100.0, float(est.get("level") or 0)))
    rate = HUNGER_RATE.get(libido_grade(rec), 1.8) * HUNGER_STAGE_MULT[LF.stage_band(rec.get("stage"))]
    start = max(_ms(est.get("at")), _ms(rec.get("hungerSated")))
    hours = max(0.0, (now_ms - start) / HOUR_MS)
    return max(0.0, min(100.0, float(est.get("level") or 0) + rate * hours))


def hunger_shift(rec: dict, delta: int, now_ms: int) -> None:
    """RP5 讓飢渴變了（+ 奇遇／− 外面做愛）：寫進副本並累計給手機收。"""
    lvl = hunger_estimate(rec, now_ms)
    rec["hungerEst"] = {"level": max(0.0, min(100.0, lvl + delta)), "at": now_ms}
    if delta > 0:
        rec["hungerGiven"] = int(rec.get("hungerGiven") or 0) + int(delta)
    elif delta < 0:
        rec["hungerRelief"] = int(rec.get("hungerRelief") or 0) - int(delta)


def loyalty_now(rec: dict) -> float:
    seen = _num(rec.get("loyaltySeen"), 60) if rec.get("loyaltySeen") is not None else 60.0
    pending = max(0, int(rec.get("loyaltyLoss") or 0) - int(rec.get("loyaltyTaken") or 0))
    return max(0.0, min(100.0, seen - pending))


def ero_chance(rec: dict, started: bool, mood: str, level: int, night: bool = False, now_ms: int = 0) -> float:
    base = D.ERO_NEXT_CHANCE if started else D.ERO_FIRST_CHANCE
    mult = 1.0 + (MOOD_ERO.get(mood, 1.0) - 1.0) * min(1.0, level / 60)
    mult *= LIBIDO_ERO[libido_grade(rec)]
    mult *= 0.7 + hunger_estimate(rec, now_ms) / 100   # 飢渴 0 → ×0.7、100 → ×1.7
    if night:
        mult *= 1.3
    return min(ERO_NEXT_CAP if started else ERO_FIRST_CAP, base * mult)


def roll_ero(rec: dict, mood: str, level: int, rnd, night: bool = False, now_ms: int = 0) -> dict | None:
    """色情變態奇遇：已經開始的那件優先，再碰到就進下一步。她只是看見。"""
    if now_ms and now_ms < _gate(rec, "ero"):
        return None
    steps = rec.get("eroSteps") or {}
    open_ = [(e, int(steps.get(e["id"]) or 0)) for e in D.EROTIC_EVENTS if int(steps.get(e["id"]) or 0) < len(e["stages"])]
    started = [x for x in open_ if x[1] > 0]
    use = started or open_
    if not use:
        return None
    if not float(rnd()) < ero_chance(rec, bool(started), mood, level, night, now_ms):
        return None
    event, step = _pick(use, rnd)
    hunger = int(round(D.ERO_HUNGER[min(step, len(D.ERO_HUNGER) - 1)] * LIBIDO_HUNGER[libido_grade(rec)]))
    return {"id": event["id"], "title": event["title"], "step": step, "of": len(event["stages"]),
            "stage": event["stages"][step], "prior": event["stages"][:step], "places": list(event.get("places") or []),
            "hunger": hunger}


def _new_name(gender: str, rnd) -> str:
    return _pick(D.SURNAMES, rnd) + _pick(D.GIVEN_M if gender == "male" else D.GIVEN_F, rnd)


def meet_person(rec: dict, role: str, where: str, know: bool, now_ms: int, rnd) -> dict:
    """碰到一個人：同一個地方的同身份，可能是之前碰過的（同事最常）。只記見過幾次，不交朋友。"""
    pool = [m for m in (rec.get("met") or []) if m.get("role") == role and m.get("where") == where]
    if pool and float(rnd()) < REVISIT.get(role, 0.12):
        # 越熟的人越常碰到（交友線：每多一階權重 +1）
        total = sum(1 + LF.rank(LF.stage_of(m)) for m in pool)
        r = float(rnd()) * total
        old = pool[-1]
        for m in pool:
            r -= 1 + LF.rank(LF.stage_of(m))
            if r < 0:
                old = m
                break
        return {"id": old["id"], "name": old["name"], "gender": old.get("gender") or "", "role": role,
                "where": where, "named": bool(old.get("named") or know), "revisit": True,
                "count": int(old.get("count") or 1) + 1, "stage": LF.stage_of(old), "intent": old.get("intent") or ""}
    gender = "male" if float(rnd()) < 0.5 else "female"
    return {"id": f"p{now_ms % 10**9}{int(float(rnd()) * 1000)}", "name": _new_name(gender, rnd), "gender": gender,
            "role": role, "where": where, "named": bool(know), "revisit": False, "count": 1,
            "stage": "known" if know else "seen", "intent": ""}


def friend_ctx(rec: dict, now_ms: int) -> dict:
    mood, _lvl = mood_now(rec, now_ms)
    return {"stage": rec.get("stage") or "stranger", "loyalty": loyalty_now(rec), "hunger": hunger_estimate(rec, now_ms),
            "mood": mood, "archetype": rec.get("archetype") or ""}


def _roll_bond(rec: dict, ev: dict, act: dict, now_ms: int, rnd) -> None:
    """交友線：碰到的人往前（或朋友往回）走一步。結果放 ev["bond"]，settle 才寫進 met。"""
    p = ev.get("person")
    if not p:
        return
    know = bool(act.get("know"))
    if not p.get("revisit"):
        if know:
            ev["bond"] = {"from": "seen", "to": "known", "sex": False, "regress": False, "intent": LF.pick_intent(rnd)}
        return
    row = next((m for m in rec.get("met") or [] if isinstance(m, dict) and m.get("id") == p["id"]), None) or dict(p)
    step = LF.advance(row, friend_ctx(rec, now_ms), now_ms, rnd, act.get("id") or "", know)
    if step["to"] == step["from"] and not step["sex"]:
        return
    if step["to"] == "known" and not row.get("intent"):
        step["intent"] = LF.pick_intent(rnd)
    else:
        step["intent"] = row.get("intent") or ""
    if LF.rank(step["to"]) >= LF.rank("known"):
        p["named"] = True
    p["stage"] = step["to"]
    ev["bond"] = step
    if step["sex"] or step["to"] == "flirt":
        ev["emotion"] = "樂"


def person_label(p: dict | None) -> str:
    if not p:
        return ""
    return p["name"] if p.get("named") else f"一位{p.get('role') or '路人'}"


def roll_event(rec: dict, kind: str, now_ms: int, rnd=None) -> dict:
    """結算時擲這一趟發生什麼。結果存在 agenda.event，模型重試也用同一份。"""
    roll = rnd if rnd is not None else random.random
    mood, level = mood_now(rec, now_ms)
    h = jst_hour(now_ms)
    night = h >= 20 or h < 5
    ev = {"kind": kind, "moodBefore": mood, "moodBeforeLevel": level}
    if kind == "work":
        job = ensure_job(rec, roll)
        ev["job"] = job["name"]
        eerie = _job_tone(job.get("id")) == "eerie"
        scp = roll_scp(rec, "work", mood, level, roll, eerie=eerie, now_ms=now_ms)
        role = _pick(D.SHIFT_ROLES, roll)["name"]
        emotion = _pick_by(D.EMOTIONS, MOOD_EMOTION, mood, level, roll)
        act = _pick_by(D.SHIFT_ACTS, MOOD_ACT, mood, level, roll)
        if scp:
            ev["scp"] = scp
            act = {"id": "scp", "name": scp["title"], "know": False}
        ev["person"] = meet_person(rec, role, job["name"], act.get("know", False), now_ms, roll)
        if not scp:
            _roll_bond(rec, ev, act, now_ms, roll)
        ev["emotion"] = emotion["name"]
        ev["act"] = act["name"]
        ev["actId"] = act["id"]
        ev["fatigue"] = shifts_in_day(rec, now_ms) >= 2 and float(roll()) < 0.4
    elif kind == "stroll":
        place = _pick(D.STROLL_PLACES, roll)
        spot = (rec.get("spots") or {}).get(place["id"]) or place["name"]
        ev["place"] = spot
        scp = roll_scp(rec, "stroll", mood, level, roll, night=night, now_ms=now_ms)
        tone_w = {t["id"]: t["weight"] * _mood_mult(MOOD_TONE, mood, level, t["id"]) * (1.5 if night and t["id"] == "horror" else 1.0)
                  for t in D.STROLL_TONES}
        tone = _pick_weighted(tone_w, roll)
        p_person = PERSON_BASE * _mood_mult({mood: {"p": MOOD_PERSON.get(mood, 1.0)}}, mood, level, "p")
        has_person = float(roll()) < p_person
        ero = None if scp else roll_ero(rec, mood, level, roll, night=night, now_ms=now_ms)
        if scp:
            ev["scp"] = scp
            ev["tone"] = "scp"
            ev["toneName"] = f"{scp['code']} {scp['step'] + 1}/{scp['of']}"
            ev["act"] = scp["title"]
            ev["actId"] = "scp"
            has_person = False
        elif ero:
            # 地點跟著這件事走（只會在它寫的那幾種地方）
            pid = place["id"] if place["id"] in ero["places"] or not ero["places"] else _pick(ero["places"], roll)
            pl = next((x for x in D.STROLL_PLACES if x["id"] == pid), place)
            ev["place"] = (rec.get("spots") or {}).get(pl["id"]) or pl["name"]
            ev["ero"] = ero
            ev["tone"] = "erotic"
            ev["toneName"] = f"色情變態奇遇 {ero['step'] + 1}/{ero['of']}"
            ev["act"] = ero["title"]
            ev["actId"] = "ero"
            has_person = False
        else:
            ev["tone"] = tone
            ev["toneName"] = next(t["name"] for t in D.STROLL_TONES if t["id"] == tone)
            acts = D.STROLL_PERSON[tone] if has_person else D.STROLL_SOLO[tone]
            act = _pick_by(acts, MOOD_ACT, mood, level, roll)
            ev["act"] = act["name"]
            ev["actId"] = act["id"]
            if has_person:
                ev["emotion"] = _pick_by(D.EMOTIONS, MOOD_EMOTION, mood, level, roll)["name"]
                ev["person"] = meet_person(rec, "路人", spot, act.get("know", False), now_ms, roll)
                _roll_bond(rec, ev, act, now_ms, roll)
    elif kind == "browse":
        ev["firstToday"] = int((rec.get("homeDay") or {}).get("browse") or 0) == 0
    elif kind == "meal":
        ev["meal"] = (rec.get("agenda") or {}).get("meal") or "一餐"
    elif kind == "sleep":
        agenda = rec.get("agenda") or {}
        ev["nap"] = 0 < _ms(agenda.get("until")) - _ms(agenda.get("startedAt")) < 3 * HOUR_MS
        ev["nightmare"] = mood == "不安" and level >= 35 and float(roll()) < 0.45
        ev["poor"] = (not ev["nightmare"]) and rec.get("chrono") == "淺眠易怒" and float(roll()) < 0.25
    ev["outcome"] = _outcome(ev, rec, roll)
    return ev


def _outcome(ev: dict, rec: dict, rnd) -> dict:
    """這一趟讓心情變成什麼。回 {mood, level, why}；平靜＝把現在的心情壓下去多少。"""
    kind = ev.get("kind")
    if kind == "sleep":
        if ev.get("nightmare"):
            return {"mood": "不安", "level": 40, "why": "做了惡夢"}
        if ev.get("poor"):
            return {"mood": "不悅", "level": 25, "why": "睡不好、被吵醒好幾次"}
        calm = 15 if ev.get("nap") else 35
        if rec.get("chrono") == "隨和好睡":
            calm += 15
        return {"mood": "平靜", "level": calm, "why": "睡過一覺"}
    if kind in HOME_KINDS:
        calm = {"browse": 6, "idle": 10, "tidy": 14, "meal": 8}[kind]
        if kind == "meal" and ev.get("moodBefore") == "虛脫":
            calm = 20
        return {"mood": "平靜", "level": calm, "why": "在住所待著"}
    where = ev.get("place") or ev.get("job") or ""
    scp = ev.get("scp")
    if scp:
        step = int(scp.get("step") or 0)
        if scp.get("feel") == "wonder":
            return {"mood": "愉快", "level": 28 + 5 * step, "why": f"在{where}碰上說不清的奇妙事"}
        level = (40, 50, 60, 70, 50)[min(step, 4)]  # 第 5 步收尾，餘悸比第 4 步小
        return {"mood": "不安", "level": level, "why": f"在{where}撞見說不清的怪事"}
    ero = ev.get("ero")
    if ero:
        return {"mood": "臉紅心跳", "level": 25 + 8 * int(ero.get("step") or 0), "why": f"在{where}撞見讓人臉紅的事"}
    naked = ev.get("naked")
    if naked:
        n = int(naked.get("count") or 1)
        if n >= 8:
            return {"mood": "虛脫", "level": min(90, 40 + 3 * n), "why": "回住所的路上被做到腿軟"}
        if LF.stage_band(rec.get("stage")) in ("dating", "wife"):
            return {"mood": "心虛", "level": 45, "why": "光著身子回去的路上跟人做了"}
        return {"mood": "臉紅心跳", "level": 40, "why": "光著身子回去的路上跟人做了"}
    bond = ev.get("bond")
    if bond:
        who = person_label(ev.get("person"))
        dating = LF.stage_band(rec.get("stage")) in ("dating", "wife")
        if bond.get("regress"):
            return {"mood": "低落", "level": 20, "why": f"跟{who}疏遠了"}
        if bond.get("sex"):
            return {"mood": "心虛", "level": 45, "why": f"跟{who}上床了"} if dating else {"mood": "臉紅心跳", "level": 40, "why": f"跟{who}上床了"}
        if bond.get("to") == "flirt":
            return {"mood": "心虛", "level": 35, "why": f"跟{who}越線了"} if dating else {"mood": "臉紅心跳", "level": 35, "why": f"跟{who}有點曖昧"}
        if bond.get("to") == "friend":
            return {"mood": "愉快", "level": 25, "why": f"跟{who}變成朋友"}
    tone = ev.get("tone")
    if tone == "horror":
        return {"mood": "不安", "level": 35 + int(float(rnd()) * 16), "why": f"在{where}碰到詭異的事"}
    emotion = ev.get("emotion") or ""
    act = ev.get("actId") or ""
    who = person_label(ev.get("person")) if ev.get("person") else ""
    if emotion == "怒":
        out = {"mood": "不悅", "level": 30, "why": f"{who}對她發脾氣"}
    elif emotion == "哀":
        out = {"mood": "低落", "level": 28, "why": f"{who}很消沉，被感染"}
    elif emotion in ("喜", "樂"):
        out = {"mood": "愉快", "level": 28, "why": f"跟{who}處得開心"}
    elif tone == "wonder":
        out = {"mood": "愉快", "level": 35, "why": f"在{where}碰上巧事"}
    else:
        out = {"mood": "平靜", "level": 10, "why": f"在{where}散心" if kind == "stroll" else "做完一班"}
    if tone == "wonder" and out["mood"] != "愉快" and out["mood"] != "不悅":
        out = {"mood": "愉快", "level": 32, "why": f"在{where}碰上巧事"}
    if act == "blame":
        bad = "不悅" if ev.get("moodBefore") == "不悅" or emotion == "怒" else "低落"
        out = {"mood": bad, "level": 40, "why": f"被{who}責怪"}
    elif act == "argue":
        out = {"mood": "不悅", "level": 42, "why": f"跟{who}起了爭執"}
    elif act in ("help", "chat", "contact", "favor", "greet", "return") and out["mood"] == "愉快":
        out["level"] += 10
    elif act in ("glance", "quiet", "yield", "pass", "together") and out["mood"] != "平靜":
        out["level"] = int(out["level"] * 0.5)
    elif act == "lost":
        out = {"mood": "不悅", "level": 15, "why": f"在{where}迷路"}
    return out


# ───────────────────────── 寫成文字 ─────────────────────────
SCP_RULE = "她不認識編號，不要讓她說出編號。不要寫收容程序，不要寫血腥或傷害過程。"


def scp_brief(scp: dict) -> str:
    prior = "\n".join(f"{i + 1}. {line}" for i, line in enumerate(scp.get("prior") or []))
    return "\n".join([
        f"這是同一件怪事的第 {scp['step'] + 1}/{scp['of']} 步，" + (
            "這是最後一步：事情收尾、離開她的生活，但留下一個小小的痕跡。" if scp["step"] + 1 >= scp["of"]
            else ("要比上一次更奇妙。" if scp.get("feel") == "wonder" else "要比上一次更可怕。")),
        f"這一步只寫：{scp['stage']}",
        f"她已經歷過：\n{prior}\n接著寫，不要重頭，不要跳到更後面。" if prior else ("這是第一次。只寫這一點奇妙的地方，不要把後面的事一次寫完。" if scp.get("feel") == "wonder" else "這是第一次。只寫這一點不對勁，不要把後面的恐怖一次寫完。"),
        SCP_RULE,
    ])


ERO_RULE = ("這是色情變態奇遇：你只是路過看見，從頭到尾是旁觀者。沒有人碰你、找你加入、對你說話或做任何事，你也沒有參與。"
            "場面裡的人全都是明確的成年人，彼此同意、玩得很投入。可以撩人、寫出看到的姿態和聲音，但不要露骨描寫性器官或過程。"
            "嚴禁：動物或人獸、未成年或孩子氣的設定（不要寫學生、制服、少女少年、年紀小）、非自願或強迫、亂倫、排泄。"
            "寫你看到時的反應：害羞、心跳、移不開眼睛或趕快走開，身體有點熱。")


def ero_brief(ero: dict) -> str:
    prior = "\n".join(f"{i + 1}. {line}" for i, line in enumerate(ero.get("prior") or []))
    last = ero["step"] + 1 >= ero["of"]
    return "\n".join([
        f"這是同一件事的第 {ero['step'] + 1}/{ero['of']} 步（{ero['title']}）。" + (
            "這是最後一步：事情告一段落，只在她心裡留下痕跡。" if last else ("要比上一次更大膽一點。" if ero["step"] else "")),
        f"這一步看到的：{ero['stage']}（表裡的「她」可能是場面裡的人，也可能是你自己；你一律用「我」寫自己）",
        f"之前看過：\n{prior}\n接著寫，不要重頭，不要跳到更後面。" if prior else "這是第一次看到，只寫這一眼，不要把後面的事一次寫完。",
        ERO_RULE,
    ])


ERO_BAN_RE = re.compile(r"學生|制服|校服|少女|少年|女孩|男孩|小孩|孩子|幼|未成年|強迫|強暴|強姦|迷姦|非自願|亂倫|哥哥|妹妹|姐姐|弟弟|爸爸|媽媽|排泄|尿|屎|糞|動物|人獸|獸交|獸姦|野獸|一隻狗|一條狗|小狗|大狗|母狗|公狗|野狗|家犬|一隻貓|小貓|野貓|馬匹")


def needs_llm(ev: dict) -> bool:
    if ev.get("kind") == "sleep":
        return bool(ev.get("nightmare"))
    return ev.get("kind") in ("work", "stroll")


def event_prompt(action: dict) -> tuple[str, str]:
    ev = action.get("event") or {}
    kind = ev.get("kind")
    name = action.get("name") or "她"
    p = ev.get("person")
    persona = "、".join(x for x in [action.get("archetype") or "", action.get("tone") or ""] if x)
    common = [
        action.get("clock") or "",
        action.get("span") or "",
        f"人在日本{action.get('groundName') or action.get('regionName') or ''}，住所是{action.get('homeName') or '自己的房間'}。不在召喚者那裡，不要寫召喚者的房間。",
        f"個性：{persona}。" if persona else "",
        f"出門前的心情是{ev.get('moodBefore') or '平靜'}。",
        f"寫完時她的感覺要接近「{(ev.get('outcome') or {}).get('mood') or '平靜'}」，但不要直接說出這兩個字。",
        "不要標題，不要列選項，不要提到遊戲或抽籤。",
    ]
    naked = ev.get("naked")
    if naked:
        g = "男性" if (p or {}).get("gender") != "female" else "女性"
        partner = (f"對方是{p['name']}（{g}，{LF.STAGE_ZH.get(naked.get('fromStage') or '', '')}），你認識他。" if naked.get("known")
                   else f"對方是路上碰到的陌生{g}，你不知道對方的名字，不要替對方取名字。" if naked.get("result") == "anon"
                   else f"對方是路上碰到的陌生{g}，做完互相留了名字：{p['name']}。")
        body = [
            f"你剛從召喚者的房間被送回日本，身上一絲不掛。回住所的路上（{ev.get('place')}）你沒有直接回去。",
            partner,
            f"你們接連做了{naked['count']}次。" + ("做到最後你腿軟、幾乎站不起來。" if naked["count"] >= 8 else ""),
            LF.CONSENT_RULE,
            "你是自己跟著走的，或半推半就地答應；被看見光著身子時的羞恥和興奮都可以寫。",
        ]
        if LF.stage_band(action.get("stage")) in ("dating", "wife"):
            body.append(LF.GUILT_RULE)
        lead = f"你是{name}。用「我」寫剛剛回住所路上發生的事，2到4句。"
        return ("你只寫她和對方之間發生的事，對方要有動作或話。", "\n".join(x for x in [lead] + common + body if x))
    if kind == "sleep":
        return ("你只寫她剛醒來時還記得的夢。",
                "\n".join([f"你是{name}。用「我」寫剛做的惡夢，2到3句。停在醒來時的害怕。不要血腥。"] + common))
    if p:
        system = "你只寫她和對方的互動。沒有對方的反應就不算寫完。"
        g = "男性" if p.get("gender") == "male" else "女性"
        if p.get("named"):
            meet = f"對方叫{p['name']}（{g}），她知道對方的名字，可以寫出來。"
        else:
            meet = f"對方是{g}，她不知道對方的名字。不要替對方取名字。"
        if p.get("revisit"):
            meet += f"這是第{p.get('count') or 2}次在這裡碰到對方，她認得出來。"
        who_line = f"對方是{p.get('role')}，情緒是{ev.get('emotion') or '平靜'}。情緒要出現在對方對我的反應裡，不要單獨標註。"
        body = [
            "必須是兩個人的來回：我先說或先做，對方一定要有動作或回話，我再接一句。",
            meet, who_line,
            f"互動只沿著這個方向：{ev.get('act')}。細節自己編，但兩邊都要出場。",
        ]
    else:
        system = "你只寫她一個人在那個地方的經過。不要硬加一個認識的人。"
        body = [f"事情只沿著這個方向：{ev.get('act')}。細節自己編。"]
    if kind == "work":
        lead = f"你是{name}。用「我」寫剛結束的打工裡發生的事，2到4句。打工是「{ev.get('job')}」。"
    else:
        lead = f"你是{name}。用「我」寫在{ev.get('place')}溜達時發生的事，2到4句。人就在{ev.get('place')}，不要改到別的地方。這不是打工。"
    scp = ev.get("scp")
    if scp:
        body.insert(0, scp_brief(scp))
    elif ev.get("ero"):
        body = [ero_brief(ev["ero"])]
        system = "你只寫她自己一個人路過、看見的經過。她只是旁觀。"
    elif kind == "stroll":
        body.insert(0, D.STROLL_TONE_RULE.get(ev.get("tone") or "daily", ""))
    bond = ev.get("bond")
    if bond and p:
        body += LF.bond_lines(bond, person_label(p), bond.get("intent") or "", LF.stage_band(action.get("stage")))
    return system, "\n".join(x for x in [lead] + common + body if x)


_PERSON_RE = re.compile(r"他|她|對方|同事|顧客|客人|路人|那人|那個人|大叔|阿姨|先生|小姐")


def accept_text(action: dict, raw: str) -> str:
    text = "\n".join(line for line in str(raw or "").splitlines() if not re.match(r"\s*(名字|標題)[:：]", line))
    text = clip_text(text)
    ev = action.get("event") or {}
    if len(text) < 8 or "我" not in text:
        return ""
    p = ev.get("person")
    if p and not (_PERSON_RE.search(text) or (p.get("named") and p.get("name") in text)):
        return ""
    if ev.get("ero") and ERO_BAN_RE.search(text):
        return ""  # 碰到禁區字眼就重寫／用範本
    if (ev.get("naked") or (ev.get("bond") or {}).get("sex") or (ev.get("bond") or {}).get("to") == "flirt") and CONSENT_BAN.search(text):
        return ""  # 一定要是她自己願意／半推半就
    return text


CONSENT_BAN = re.compile(LF.CONSENT_BAN_RE)

RETRY_ASK = "上一則不符合。用「我」重寫，2到4句，照上面的方向；有對方的話對方一定要回話或有動作。"


EMOTION_LOOK = {"喜": "很高興", "怒": "在生氣", "哀": "很消沉", "樂": "心情很好"}


def fallback_text(action: dict) -> str:
    ev = action.get("event") or {}
    kind = ev.get("kind")
    p = ev.get("person")
    who = person_label(p)
    look = EMOTION_LOOK.get(ev.get("emotion") or "", "沒什麼表情")
    if kind == "sleep":
        return "我睡得很不安穩，夢裡一直有東西在門外。醒來的時候心還在跳。" if ev.get("nightmare") else "我睡了一覺。"
    if kind in HOME_KINDS:
        return home_line(ev, action.get("ms") or 0)
    if ev.get("scp"):
        where = ev.get("job") or ev.get("place") or "那裡"
        scp = ev["scp"]
        step = int(scp.get("step") or 0)
        if step + 1 >= int(scp.get("of") or 5):
            return f"我在{where}想起{scp['title']}的事。它好像結束了，可是總覺得留下了什麼。"
        if scp.get("feel") == "wonder":
            return f"我在{where}碰上{scp['title']}，奇妙得說不出話。我看了好一會兒才走。"
        return f"我在{where}看見{scp['title']}，有什麼地方不對勁。我沒有再靠近。"
    if ev.get("ero"):
        return ero_fallback(ev)
    if ev.get("naked"):
        return naked_fallback(ev)
    bond = ev.get("bond")
    if bond and p:
        line = bond_fallback(ev, who)
        if line:
            return line
    if kind == "work":
        if p:
            return f"我在{ev.get('job')}碰到{who}，對方{look}。這一班跟對方{ev.get('act')}，我回了幾句，對方也有反應。"
        return f"我在{ev.get('job')}做完這一班。"
    tail = "心裡發毛，沒有再靠近。" if ev.get("tone") == "horror" else "事情巧得有點過分。" if ev.get("tone") == "wonder" else "待了一會兒就繼續走。"
    if p:
        return f"我在{ev.get('place')}碰到{who}，對方{look}。我們{ev.get('act')}，我回了幾句，對方也有反應。{tail}"
    return f"我在{ev.get('place')}{ev.get('act')}，{tail}"


def naked_fallback(ev: dict) -> str:
    n = ev["naked"]
    p = ev.get("person") or {}
    where = ev.get("place") or "回去的路上"
    who = p.get("name") if n.get("known") else "一個陌生人"
    tail = "最後腿軟得要扶著牆才走得回去。" if int(n.get("count") or 1) >= 8 else "回到住所時臉還是燙的。"
    named = f"分開前他跟我說了名字，{p.get('name')}。" if (not n.get("known") and n.get("result") != "anon") else ""
    return f"我光著身子回到日本，在{where}被{who}看見了。他問我要不要跟他走，我半推半就地點了頭，我們接連做了{n.get('count')}次。{named}{tail}"


def bond_fallback(ev: dict, who: str) -> str:
    b = ev["bond"]
    place = ev.get("job") or ev.get("place") or "那裡"
    if b.get("regress"):
        return f"我在{place}又碰到{who}，好久沒聯絡，聊起來有點生疏。對方也只是客氣地笑了笑。"
    if b.get("sex") and b.get("from") in ("physical", "fwb"):
        return f"我在{place}又碰到{who}。對方一個眼神我就懂了，我沒有拒絕，後來我們又去了沒人的地方。"
    to = b.get("to")
    if to == "known":
        return f"我在{place}又碰到{who}，這次互相報了名字。對方笑著說下次見，我也點點頭。"
    if to == "friend":
        return f"我在{place}跟{who}聊得很開心，交換了聯絡方式。對方說改天約出來，我答應了。"
    if to == "flirt":
        return f"我在{place}跟{who}待到很晚，對方牽起我的手，我沒有抽開。分開前他靠過來親了我一下。"
    if to == "physical":
        return f"我在{place}跟{who}待到最後，對方問要不要去他那裡，我猶豫了一下還是點頭。那一晚我們越過了最後那條線。"
    if to == "fwb":
        return f"我在{place}又碰到{who}，做完之後我們說好以後想要就約。我沒有覺得哪裡不對。"
    return ""


def ero_fallback(ev: dict) -> str:
    ero = ev["ero"]
    place, title = ev.get("place") or "那裡", ero["title"]
    return [
        f"我在{place}溜達時，好像看到了{title}……我假裝沒看見，快步走開，心跳卻停不下來。",
        f"我在{place}又碰到{title}，這次看得比上次清楚。我躲在一邊偷看了一下，臉燙得要命。",
        f"在{place}，{title}這次完全沒在遮。我站在遠處移不開眼睛，腿有點軟。",
        f"{place}的{title}越來越大膽，旁邊還多了圍觀的人。我縮在角落不敢出聲，心臟快跳出來了。",
        f"我又經過{place}，想起{title}的事。好像告一段落了，可是那個畫面一直留在我腦子裡。",
    ][min(int(ero.get("step") or 0), 4)]


# ───────────────────────── 在家 ─────────────────────────
def _span_zh(ms: int) -> str:
    mins = max(0, int(round(ms / 60000 / 30)) * 30)
    if mins < 60:
        return "半小時"
    h, half = divmod(mins, 60)
    num = "一兩三四五六七八九十"[h - 1] if 1 <= h <= 10 else str(h)
    return f"{num}個半小時" if half else f"{num}個小時"


def home_line(ev: dict, ms: int) -> str:
    """面板上「上一件」用的一句（不進記憶）。"""
    kind = ev.get("kind")
    if kind == "idle":
        return f"在住所發呆了{_span_zh(ms)}。"
    if kind == "tidy":
        return "把住所整理了一下。"
    if kind == "meal":
        return f"在住所吃了{ev.get('meal') or '一餐'}。"
    return "在住所上網，隨便滑了一陣。"


def _note_home(rec: dict, kind: str, ev: dict, span: int, keys) -> None:
    day = rec.get("homeDay") if isinstance(rec.get("homeDay"), dict) else {}
    day.setdefault("since", _ms((rec.get("agenda") or {}).get("startedAt")))
    if kind == "idle":
        day["idleMs"] = int(day.get("idleMs") or 0) + max(0, span)
    elif kind == "tidy":
        day["tidy"] = int(day.get("tidy") or 0) + 1
    elif kind == "meal":
        day["meals"] = (list(day.get("meals") or []) + [ev.get("meal") or "一餐"])[-4:]
    elif kind == "browse":
        day["browse"] = int(day.get("browse") or 0) + 1
        title = str((list(keys or []) + ["", "", ""])[2] or "")
        if title and title not in (day.get("titles") or []):
            day["titles"] = (list(day.get("titles") or []) + [title])[-3:]
    rec["homeDay"] = day


MOOD_TAIL = {"平靜": "日子很平。", "愉快": "心情還不錯。", "低落": "一直提不起勁。", "不安": "總覺得靜不下來。", "不悅": "有點悶。", "虛脫": "累得什麼都不想做。"}


def write_home_day(rec: dict, now_ms: int) -> dict | None:
    """要睡了：把今天在家的事併成一行記憶（範本、不叫模型），再清空。"""
    day = rec.get("homeDay") if isinstance(rec.get("homeDay"), dict) else {}
    rec["homeDay"] = {}
    bits = []
    if int(day.get("idleMs") or 0) >= 30 * 60 * 1000:
        bits.append(f"發呆了{_span_zh(int(day['idleMs']))}")
    if day.get("tidy"):
        bits.append("整理了房間")
    meals = day.get("meals") or []
    if meals:
        bits.append(f"吃了{'、'.join(meals)}")
    if day.get("titles"):
        bits.append(f"上網看到「{day['titles'][-1][:40]}」")
    elif day.get("browse"):
        bits.append("上網滑了一陣")
    if not bits:
        return None
    home = rec.get("homeName") or ""
    mood = mood_now(rec, now_ms)[0]
    text = f"今天在住所{home}：{'、'.join(bits)}。{MOOD_TAIL.get(mood, '')}"
    return _remember(rec, "home", text, now_ms, ["住所", "在家", home], {"place": home, "moodBefore": mood, "moodAfter": mood})


# ───────────────────────── 排程與結算 ─────────────────────────
def quick_step(store: dict, now_ms: int, rnd=None) -> list[str]:
    """不用模型的事一次做完：替每個空檔的人排下一件、睡醒但沒做夢的人直接結算。"""
    logs = []
    for gid, rec in (store.get("girls") or {}).items():
        if needs_choice(rec):
            nk, ms = pick_next(rec, now_ms, rnd)
            arm(rec, nk, now_ms, rnd, ms)
            logs.append(f"{rec.get('name') or '她'} 排了{KIND_ZH[nk]}（{int(ms / 60000)} 分）")
            continue
        if is_due(rec, now_ms) and rec["agenda"].get("kind") == "escort":
            last = settle_escort(rec, now_ms, rnd)
            logs.append(f"{rec.get('name') or '她'} 接客收工：{(last or {}).get('clients')} 位、{(last or {}).get('paid')} 金")
            continue
        if is_due(rec, now_ms) and rec["agenda"].get("kind") in ("idle", "tidy", "meal"):
            agenda = rec["agenda"]
            kind = agenda["kind"]
            settle(store, gid, _ms(agenda.get("until")), "", now_ms, rnd)
            logs.append(f"{rec.get('name') or '她'} 在家{KIND_ZH[kind]}完")
            continue
        if is_due(rec, now_ms) and (rec["agenda"].get("kind") == "sleep"):
            agenda = rec["agenda"]
            if not isinstance(agenda.get("event"), dict):
                agenda["event"] = roll_event(rec, "sleep", now_ms, rnd)
            if not needs_llm(agenda["event"]):
                settle(store, gid, _ms(agenda.get("until")), "", now_ms, rnd)
                logs.append(f"{rec.get('name') or '她'} 睡醒了，心情{rec.get('mood') or '平靜'}")
    return logs


def next_due(store: dict, now_ms: int) -> str:
    """最久沒結算的那位先（避免一直卡同一位、別人排隊）。"""
    best, best_until = "", 0
    for gid, rec in (store.get("girls") or {}).items():
        if is_due(rec, now_ms):
            until = _ms(rec["agenda"].get("until"))
            if not best or until < best_until:
                best, best_until = gid, until
    return best


def prepare_resolve(store: dict, gid: str, now_ms: int, rnd=None) -> dict | None:
    rec = (store.get("girls") or {}).get(gid)
    if not rec or not is_due(rec, now_ms):
        return None
    agenda = rec["agenda"]
    kind = agenda.get("kind") or "work"
    if not isinstance(agenda.get("event"), dict):
        agenda["event"] = roll_event(rec, kind, now_ms, rnd)
    return {
        "op": "resolve",
        "id": gid,
        "until": _ms(agenda.get("until")),
        "startedAt": _ms(agenda.get("startedAt")),
        "kind": kind,
        "event": agenda["event"],
        "name": rec.get("name") or "她",
        "archetype": rec.get("archetype") or "",
        "tone": rec.get("tone") or "",
        "homeName": rec.get("homeName") or "",
        "regionName": rec.get("regionName") or "",
        "groundName": rec.get("groundName") or "",
        "job": (rec.get("job") or {}).get("name") or "",
        "hobbies": list(rec.get("hobbies") or []),
        "mood": mood_now(rec, now_ms)[0],
        "stage": rec.get("stage") or "stranger",
        "clock": japan_clock(min(now_ms, _ms(agenda.get("until")) or now_ms))["line"],
    }


def plan_tick(store: dict, now_ms: int) -> list[dict]:
    """相容舊呼叫：先做不用模型的事，再回最多一件要寫字的結算。"""
    quick_step(store, now_ms)
    gid = next_due(store, now_ms)
    action = prepare_resolve(store, gid, now_ms) if gid else None
    return [action] if action else []


def _note_met(rec: dict, p: dict, ev: dict, at: int) -> None:
    met = [m for m in (rec.get("met") or []) if isinstance(m, dict)]
    row = next((m for m in met if m.get("id") == p["id"]), None)
    if row is None:
        row = {"id": p["id"], "name": p["name"], "gender": p.get("gender") or "", "role": p.get("role") or "",
               "where": p.get("where") or "", "named": bool(p.get("named")), "firstAt": at, "count": 0}
        met.append(row)
    row["count"] = int(row.get("count") or 0) + 1
    row["named"] = bool(row.get("named") or p.get("named"))
    row["lastAt"] = at
    row["lastAct"] = ev.get("act") or ""
    row["lastEmotion"] = ev.get("emotion") or ""
    if len(met) > MET_CAP:
        # 先丟只見過一次、不知道名字的；還是太多才丟最舊的
        met.sort(key=lambda m: (bool(m.get("named")) or int(m.get("count") or 0) > 1, _ms(m.get("lastAt"))))
        met = met[len(met) - MET_CAP:]
        met.sort(key=lambda m: _ms(m.get("firstAt")))
    rec["met"] = met


def _affair(rec: dict, name: str, kind: str, rounds: int, at: int, relief: int | None = None, loyalty: int | None = None,
            fathers: list | None = None, rnd=None) -> None:
    """外面做愛的後果：飢渴降、忠誠慢慢掉、下次進房間身上還有痕跡（手機收）；被內射可能懷孕（pregnancy.py）。"""
    if fathers is None:
        fathers = [{"name": name or "不知名的男人", "role": ""}] * max(1, int(rounds or 1))
    PG.roll(rec, str(rec.get("id") or rec.get("name") or ""), fathers, at, hunger_estimate(rec, at), kind, rnd)
    hunger_shift(rec, -int(relief if relief is not None else LF.SEX_HUNGER_RELIEF), at)
    rec["loyaltyLoss"] = int(rec.get("loyaltyLoss") or 0) + int(loyalty if loyalty is not None else LF.LOYALTY_PER_SEX)
    rec["traceSeq"] = int(rec.get("traceSeq") or 0) + 1
    trace = {"seq": rec["traceSeq"], "at": at, "rounds": int(rounds), "name": name, "kind": kind}
    rec["traces"] = ([t for t in rec.get("traces") or [] if isinstance(t, dict)] + [trace])[-5:]
    rec["lastAffair"] = trace


def _settle_naked(rec: dict, ev: dict, at: int, rnd) -> None:
    n = ev["naked"]
    count = int(n.get("count") or 1)
    p = ev.get("person") or {}
    if n.get("result") == "anon":
        rec["anonSex"] = int(rec.get("anonSex") or 0) + 1
        name = ""
    else:
        row = next((m for m in rec.get("met") or [] if m.get("id") == p.get("id")), None)
        name = p.get("name") or ""
        if row is not None:
            row["named"] = True
            row["stage"] = n["result"] if LF.rank(n["result"]) > LF.rank(LF.stage_of(row)) else LF.stage_of(row)
            row["intent"] = row.get("intent") or "lust"
            row["sexCount"] = int(row.get("sexCount") or 0) + count
            row["lastSexAt"] = at
            row["stageAt"] = at
    _affair(rec, name, "naked", count, at, LF.naked_relief(count), LF.naked_loyalty(count))


def _escort_flag(world: dict, mirror_girl: dict | None) -> dict | None:
    for w in (world, (mirror_girl or {}).get("world")):
        flag = (w or {}).get("escortGo") if isinstance(w, dict) else None
        if isinstance(flag, dict) and flag.get("key"):
            return flag
    return None


# ───────────────────────── 接客還債（escort.py；2026-10-10） ─────────────────────────
def start_escort(rec: dict, debt: int, now_ms: int, rnd=None, key: str = "", force: bool = False, clients: int = 0) -> dict | None:
    """開一班接客。key：手機的旗（只開一次）；force：test_room 除錯（不看上限）。"""
    roll = rnd if rnd is not None else random.random
    if key:
        keys = [k for k in rec.get("escortKeys") or [] if isinstance(k, str)]
        if key in keys:
            return None
        rec["escortKeys"] = (keys + [key])[-8:]
    if (rec.get("agenda") or {}).get("kind") == "escort":
        return None
    if not force and not ES.limit_ok(rec, now_ms):
        return None
    plan = ES.plan_shift(rec, max(0, int(debt)), now_ms, roll, clients)
    if not plan["clients"]:
        return None
    rec["escortSeq"] = int(rec.get("escortSeq") or 0) + 1
    rec["escortStarts"] = ([int(t) for t in rec.get("escortStarts") or [] if now_ms - int(t) < 2 * ES.DAY_MS] + [now_ms])[-6:]
    rec["agenda"] = {"kind": "escort", "startedAt": now_ms, "until": now_ms + plan["ms"],
                     "event": {"escort": dict(plan, seq=rec["escortSeq"])}}
    rec["note"] = f"{rec.get('name') or '她'}去接客還債（{plan['clients']} 位客人）。"
    return rec["agenda"]


def auto_escort(store: dict, data: dict, now_ms: int, rnd=None) -> dict | None:
    """負債 > 50、老婆在日本：RP5 自己讓她去（在家的事直接打斷；睡覺、打工、溜達等它結束）。"""
    debt = ES.est_debt(data, store)
    if debt <= ES.AUTO_DEBT:
        return None
    rec = ES.pick_wife(store)
    if not rec or not ES.limit_ok(rec, now_ms):
        return None
    kind = (rec.get("agenda") or {}).get("kind")
    if kind and kind not in HOME_KINDS:
        return None
    return start_escort(rec, debt, now_ms, rnd)


ESCORT_MEMO = {
    "wronged": "為了幫他還債，我去接客了，接了{n}位客人，賺了{paid}金。身體很累，心裡有點委屈，但這是我自己決定的。",
    "resigned": "去接客還債，{n}位客人，{paid}金。做完就回來了，沒什麼好說的。",
    "willing": "今天去接客幫他還債，{n}位客人、{paid}金，還算順利，回去要他誇我。",
    "aroused": "去接客還債，{n}位客人、{paid}金……做到後來身體自己熱起來了，有點不好意思。",
}


def settle_escort(rec: dict, now_ms: int, rnd=None) -> dict | None:
    """收工：錢記進 escortPaid（手機收差額）、飢渴降、忠誠掉、痕跡、客人記進 met、心情、記憶（private: escort）。"""
    roll = rnd if rnd is not None else random.random
    agenda = rec.get("agenda") if isinstance(rec.get("agenda"), dict) else None
    if not agenda or agenda.get("kind") != "escort":
        return None
    plan = (agenda.get("event") or {}).get("escort") or {}
    at = min(now_ms, _ms(agenda.get("until")) or now_ms)
    n = int(plan.get("clients") or 1)
    paid = int(plan.get("paid") or 0)
    rec["escortPaid"] = int(rec.get("escortPaid") or 0) + paid
    rec["escortLastEnd"] = at
    rec["escortLast"] = {"seq": int(plan.get("seq") or rec.get("escortSeq") or 0), "end": at, "clients": n, "paid": paid,
                         "pays": list(plan.get("pays") or [])}
    # 客人：隨機陌生人（20% 是之前的常客），記進 met（身份「客人」，見過；常客知道名字）
    met_names = []
    regulars = [m for m in rec.get("met") or [] if isinstance(m, dict) and m.get("role") == "客人"]
    for i in range(n):
        if regulars and float(roll()) < ES.REGULAR_CHANCE:
            row = regulars[int(float(roll()) * len(regulars)) % len(regulars)]
            p = {"id": row["id"], "name": row["name"], "gender": "male", "role": "客人", "where": "工作室", "named": True}
        else:
            p = {"id": f"c{at % 10**9}{i}{int(float(roll()) * 1000)}", "name": _new_name("male", roll), "gender": "male",
                 "role": "客人", "where": "工作室", "named": False}
        _note_met(rec, p, {"act": "接客", "emotion": ""}, at)
        met_names.append({"id": p["id"], "name": p["name"] if p["named"] else "不知名的客人", "role": "客人"})
    prev_affair = rec.get("lastAffair")
    _affair(rec, "", "escort", n, at, ES.HUNGER_RELIEF_PER_CLIENT * n, ES.LOYALTY_PER_CLIENT * n, fathers=met_names, rnd=roll)
    rec["lastAffair"] = prev_affair   # 接客不是越線：痕跡照留，但不算「外面偷吃」的餘韻
    feel = ES.FEEL.get(ES.family(rec), "wronged")
    mood, lvl = ES.FEEL_MOOD[feel]
    before = mood_now(rec, at)
    after = apply_mood(rec, mood, lvl + 4 * n, f"去接客還債（{n} 位客人）", at)
    text = ESCORT_MEMO[feel].format(n=n, paid=paid)
    _remember(rec, "work", text, at, ["接客", "還債", "工作室"], {"place": "工作室", "private": "escort", "moodBefore": before[0], "moodAfter": after[0]})
    rec["last"] = {"kind": "escort", "at": at, "text": text, "place": "工作室", "person": "", "moodBefore": before[0], "moodAfter": after[0]}
    rec["agenda"] = None
    arm(rec, "idle", now_ms, roll, 30 * 60 * 1000)
    return rec["escortLast"]


def _undress_stage(girl: dict | None) -> int:
    u = (girl or {}).get("undress") if isinstance((girl or {}).get("undress"), dict) else {}
    try:
        return int(u.get("stage") or 0)
    except (TypeError, ValueError):
        return 0


def _naked_key(world: dict, mirror_girl: dict | None) -> str:
    """手機離房時全裸會在 world.leftNaked 打旗 {key, at}；名冊或房間鏡像哪邊有都算。"""
    for w in (world, (mirror_girl or {}).get("world")):
        flag = (w or {}).get("leftNaked") if isinstance(w, dict) else None
        if isinstance(flag, dict) and flag.get("key"):
            return str(flag["key"])[:40]
    return ""


def start_naked(rec: dict, key: str, now_ms: int, rnd, force: bool = False, count: int = 0) -> dict | None:
    """光著身子離開房間：70% 不會直接回住所。RP5 決定（手機關掉也照走），排成一趟「溜達」由模型寫。"""
    keys = [k for k in rec.get("nakedKeys") or [] if isinstance(k, str)]
    if key in keys and not force:
        return None
    rec["nakedKeys"] = (keys + [key])[-6:]
    if not force and float(rnd()) >= LF.NAKED_CHANCE:
        return None
    n = int(count) if count else LF.naked_count(hunger_estimate(rec, now_ms), libido_grade(rec), rnd)
    n = max(1, min(LF.NAKED_MAX, n))
    met = [m for m in rec.get("met") or [] if isinstance(m, dict)]
    partner = LF.naked_pick(met, rnd)
    result = LF.naked_result(partner, n)
    place = _pick(D.STROLL_PLACES, rnd)
    spot = (rec.get("spots") or {}).get(place["id"]) or place["name"]
    if partner is None:
        gender = "male" if float(rnd()) < 0.85 else "female"
        p = {"id": f"p{now_ms % 10**9}{int(float(rnd()) * 1000)}", "name": _new_name(gender, rnd), "gender": gender,
             "role": "路人", "where": spot, "named": result != "anon", "revisit": False, "count": 1,
             "stage": result, "intent": "lust"}
    else:
        p = {"id": partner["id"], "name": partner["name"], "gender": partner.get("gender") or "", "role": partner.get("role") or "路人",
             "where": partner.get("where") or spot, "named": True, "revisit": True,
             "count": int(partner.get("count") or 1) + 1, "stage": result, "intent": partner.get("intent") or ""}
    mood, level = mood_now(rec, now_ms)
    ev = {"kind": "stroll", "moodBefore": mood, "moodBeforeLevel": level, "place": spot,
          "tone": "naked", "toneName": "光著身子回去的路上", "act": f"回住所路上跟人做了{n}次", "actId": "naked",
          "person": p, "emotion": "樂",
          "naked": {"count": n, "result": result, "known": partner is not None,
                    "fromStage": LF.stage_of(partner) if partner else ""}}
    ev["outcome"] = _outcome(ev, rec, rnd)
    ms = min(3 * HOUR_MS, 30 * 60 * 1000 + n * 10 * 60 * 1000)
    rec["agenda"] = {"kind": "stroll", "startedAt": now_ms, "until": now_ms + ms, "event": ev}
    return ev


def force_meet(rec: dict, pid: str, now_ms: int, rnd=None) -> dict | None:
    """test_room：馬上再碰到這個人一次（照規則擲一步），一分鐘內結算。"""
    roll = rnd if rnd is not None else random.random
    row = next((m for m in rec.get("met") or [] if isinstance(m, dict) and m.get("id") == pid), None)
    if row is None or rec.get("phase") != "japan":
        return None
    role = row.get("role") or "路人"
    kind = "work" if role in ("同事", "顧客") else "stroll"
    mood, level = mood_now(rec, now_ms)
    p = {"id": row["id"], "name": row["name"], "gender": row.get("gender") or "", "role": role, "where": row.get("where") or "",
         "named": bool(row.get("named")), "revisit": True, "count": int(row.get("count") or 1) + 1,
         "stage": LF.stage_of(row), "intent": row.get("intent") or ""}
    ev = {"kind": kind, "moodBefore": mood, "moodBeforeLevel": level, "person": p, "emotion": "樂",
          "act": "聊了一陣子", "actId": "chat"}
    if kind == "work":
        ev["job"] = (ensure_job(rec, roll) or {}).get("name") or row.get("where") or ""
    else:
        ev["place"] = row.get("where") or "街上"
        ev["tone"], ev["toneName"] = "daily", "日常"
    _roll_bond(rec, ev, {"id": "chat", "know": False}, now_ms, roll)
    ev["outcome"] = _outcome(ev, rec, roll)
    rec["agenda"] = {"kind": kind, "startedAt": now_ms - 60 * 1000, "until": now_ms + 5 * 1000, "event": ev}
    return ev


def set_friend_stage(rec: dict, pid: str, stage: str, now_ms: int, rnd=None) -> bool:
    """test_room：直接改某人的階（曖昧以上也可以往回改，只給除錯用）。"""
    roll = rnd if rnd is not None else random.random
    row = next((m for m in rec.get("met") or [] if isinstance(m, dict) and m.get("id") == pid), None)
    if row is None or stage not in LF.STAGES:
        return False
    row["stage"] = stage
    if LF.rank(stage) >= LF.rank("known"):
        row["named"] = True
        row["intent"] = row.get("intent") or LF.pick_intent(roll)
    row["stageAt"] = now_ms
    return True


def settle(store: dict, gid: str, finished_until: int, text: str, now_ms: int, rnd=None, keys=None, next_kind: str = "") -> bool:
    """寫下這一趟、改心情、記碰到的人和 SCP 進度，再排下一件（從現在起算，不補欠的）。"""
    rec = (store.get("girls") or {}).get(gid)
    if not rec or rec.get("phase") != "japan":
        return False
    agenda = rec.get("agenda") if isinstance(rec.get("agenda"), dict) else None
    if not agenda or _ms(agenda.get("until")) != int(finished_until):
        return False
    if agenda.get("kind") == "escort":
        return settle_escort(rec, now_ms, rnd) is not None
    roll = rnd if rnd is not None else random.random
    kind = agenda.get("kind") if agenda.get("kind") in KINDS else "work"
    ev = agenda.get("event") if isinstance(agenda.get("event"), dict) else roll_event(rec, kind, now_ms, roll)
    at = min(now_ms, int(finished_until))
    before = mood_now(rec, at)
    out = ev.get("outcome") or {}
    after = apply_mood(rec, out.get("mood") or "平靜", out.get("level") or 0, out.get("why") or "", at)
    if kind == "sleep" and before[0] == "虛脫" and after[0] == "虛脫" and not ev.get("nightmare"):
        after = apply_mood(rec, "平靜", 100, "", at)
    if ev.get("fatigue"):
        after = apply_mood(rec, "虛脫", 40, "一天上了兩班，累垮了", at)
    p = ev.get("person")
    naked = ev.get("naked")
    if p and not (naked and naked.get("result") == "anon"):
        _note_met(rec, p, ev, at)
    bond = ev.get("bond")
    if p and bond:
        row = next((m for m in rec.get("met") or [] if m.get("id") == p["id"]), None)
        if row is not None:
            LF.apply_step(row, bond, at, roll)
            if bond.get("sex"):
                _affair(rec, row.get("name") or "", "fwb_again" if bond.get("from") == "fwb" else bond.get("to") or "physical", 1, at)
    if naked:
        _settle_naked(rec, ev, at, roll)
    scp = ev.get("scp")
    if scp:
        rec.setdefault("scpSteps", {})[scp["id"]] = int(scp["step"]) + 1
        rec["scpAt"] = at
        rec["scpNextAt"] = at + SCP_GAP_MS + int(float(roll()) * SCP_GAP_SPREAD_MS)
    ero = ev.get("ero")
    if ero:
        rec.setdefault("eroSteps", {})[ero["id"]] = int(ero["step"]) + 1
        rec["eroAt"] = at
        rec["eroNextAt"] = at + ERO_GAP_MS + int(float(roll()) * ERO_GAP_SPREAD_MS)
        # 飢渴的真相在手機：這裡只累計「給了多少」，手機用 bodyState.hunger.lifeTaken 記收過多少，差額才加（不會重複加）
        hunger_shift(rec, int(ero.get("hunger") or 0), at)
    extra = {
        "place": ev.get("place") or (rec.get("homeName") if kind in HOME_KINDS or kind == "sleep" else "") or "",
        "person": person_label(p),
        "personRole": (p or {}).get("role") or "",
        "personGender": (p or {}).get("gender") or "",
        "personId": (p or {}).get("id") or "",
        "moodBefore": before[0],
        "moodAfter": after[0],
        "tone": ev.get("toneName") or "",
        "act": ev.get("act") or "",
        "scp": (scp or {}).get("code") or "",
        "scpStep": (int(scp["step"]) + 1) if scp else "",
        "ero": (ero or {}).get("title") or "",
        "eroStep": (int(ero["step"]) + 1) if ero else "",
        "private": "ero" if ero else ("affair" if naked or (bond and (bond.get("sex") or bond.get("to") == "flirt")) else ""),
        "bond": (bond or {}).get("to") or ("physical" if naked else ""),
        "bondFrom": (bond or {}).get("from") or "",
        "naked": int(naked.get("count") or 0) if naked else "",
    }
    if naked and naked.get("result") == "anon":
        extra["person"] = "陌生人"
    if kind == "work":
        mem_keys = ["打工", ev.get("job") or "", person_label(p) if p and p.get("named") else (p or {}).get("role", "")]
    elif naked:
        mem_keys = ["回住所路上", ev.get("place") or "", "陌生人" if naked.get("result") == "anon" else (p or {}).get("name", ""), "做愛"]
    elif kind == "stroll" and ero:
        mem_keys = ["遊盪", ev.get("place") or "", "色情奇遇", ero["title"]]
    elif kind == "stroll":
        mem_keys = ["遊盪", ev.get("place") or "", ev.get("toneName") or "", person_label(p) if p and p.get("named") else ""]
    elif kind == "sleep":
        mem_keys = ["睡覺", "惡夢" if ev.get("nightmare") else "沒睡好"]
    elif kind == "browse":
        mem_keys = ["上網"]
    else:
        mem_keys = ["住所", KIND_ZH[kind]]
    span = int(finished_until) - _ms(agenda.get("startedAt"))
    if kind in HOME_KINDS:
        _note_home(rec, kind, ev, span, keys)
    mem_keys += list(keys or [])
    if after[0] != "平靜":
        mem_keys.append(after[0])
    # 在家的事不各寫一筆記憶（只有一天第一次上網看新聞寫），晚上睡前併成一行（write_home_day）
    body = text or (fallback_text({"event": ev}) if kind in ("work", "stroll") or ev.get("nightmare") or ev.get("poor") else "")
    if kind == "sleep" and ev.get("poor") and not text:
        body = "我半夜被聲音吵醒好幾次，起床氣還在。"
    item = _remember(rec, kind, body, at, mem_keys, extra) if body else None
    shown = (item or {}).get("text") or body or (home_line(ev, span) if kind in HOME_KINDS else "")
    rec["last"] = {"kind": kind, "at": at, "text": shown, "place": extra["place"],
                   "person": extra["person"], "tone": extra["tone"], "scp": extra["scp"], "scpStep": extra["scpStep"], "ero": extra["ero"], "eroStep": extra["eroStep"],
                   "hunger": int((ero or {}).get("hunger") or 0),
                   "bond": extra["bond"], "naked": extra["naked"],
                   "moodBefore": before[0], "moodAfter": after[0]}
    hist = [k for k in (rec.get("history") or []) if k in KINDS]
    hist.append(kind)
    rec["history"] = hist[-8:]
    rec["agenda"] = None
    if next_kind in KINDS:
        arm(rec, next_kind, now_ms, roll)
    else:
        nk, ms = pick_next(rec, now_ms, roll)
        arm(rec, nk, now_ms, roll, ms)
    return True


def apply_resolve(store: dict, gid: str, finished_until: int, text: str, kind: str, now_ms: int, next_kind: str = "", rnd=None, extra_keys=None) -> bool:
    """舊介面：照 settle 走。next_kind 只給測試或沙盒用；空白就照規則擲。"""
    return settle(store, gid, finished_until, text, now_ms, rnd, extra_keys, next_kind)


def _push_mind(world: dict, item: dict) -> None:
    mind = world.get("mind")
    if not isinstance(mind, dict) or isinstance(mind, list):
        mind = {"immediate": [], "mid": [], "long": [], "seeded": True}
        world["mind"] = mind
    for tier in ("immediate", "mid", "long"):
        if not isinstance(mind.get(tier), list):
            mind[tier] = []
        if any(isinstance(x, dict) and x.get("id") == item.get("id") for x in mind[tier]):
            return
    mind["immediate"].append(item)
    while len(mind["immediate"]) > 10:
        mind["mid"].append(mind["immediate"].pop(0))
    while len(mind["mid"]) > 30:
        mind["long"].append(mind["mid"].pop(0))
    while len(mind["long"]) > 1000:
        mind["long"].pop(0)
    mind["seeded"] = True


def view_of(rec: dict) -> dict:
    agenda = rec.get("agenda") if isinstance(rec.get("agenda"), dict) else None
    kind = agenda.get("kind") if agenda else ""
    until = _ms(agenda.get("until")) if agenda else 0
    activity = ""
    shift = stroll = browse = sleep = home_act = None
    if kind == "work" and until:
        activity = "work"
        shift = {"pending": True, "until": until}
    elif kind == "stroll" and until:
        activity = "wander"
        stroll = {"pending": True, "until": until}
    elif kind == "browse" and until:
        activity = "browse"
        browse = {"pending": True, "until": until, "placeName": rec.get("homeName") or ""}
    elif kind == "sleep" and until:
        activity = "sleep"
        sleep = {"pending": True, "until": until, "placeName": rec.get("homeName") or ""}
    elif kind == "escort" and until:
        activity = "escort"
    elif kind in ("idle", "tidy", "meal") and until:
        activity = kind
        home_act = {"pending": True, "until": until, "kind": kind, "meal": agenda.get("meal") or "", "placeName": rec.get("homeName") or ""}
    public_agenda = {"kind": kind, "until": until, "startedAt": _ms(agenda.get("startedAt"))} if until else None
    return {
        "id": rec.get("id") or "",
        "name": rec.get("name") or "",
        "phase": rec.get("phase") or "",
        "visitUntil": rec.get("visitUntil") or 0,
        "regionId": rec.get("regionId") or "",
        "home": {"id": rec.get("homeId") or "", "name": rec.get("homeName") or ""} if rec.get("homeId") else None,
        "job": rec.get("job"),
        "agenda": public_agenda,
        "activity": activity,
        "shift": shift,
        "stroll": stroll,
        "browse": browse,
        "sleep": sleep,
        "homeAct": home_act,
        # 心情原值＋時間；手機用同一套衰減自己算（life_schedule.js outsideMoodNow）
        "mood": rec.get("mood") or "平靜",
        "moodLevel": int(rec.get("moodLevel") or 0),
        "moodAt": _ms(rec.get("moodAt")),
        "moodWhy": rec.get("moodWhy") or "",
        "met": [dict(m) for m in (rec.get("met") or []) if isinstance(m, dict)],
        "last": rec.get("last") if isinstance(rec.get("last"), dict) else None,
        "scpSteps": dict(rec.get("scpSteps") or {}),
        "eroSteps": dict(rec.get("eroSteps") or {}),
        "hungerGiven": int(rec.get("hungerGiven") or 0),
        "hungerRelief": int(rec.get("hungerRelief") or 0),
        "loyaltyLoss": int(rec.get("loyaltyLoss") or 0),
        "traces": [dict(t) for t in rec.get("traces") or [] if isinstance(t, dict)],
        "lastAffair": rec.get("lastAffair") if isinstance(rec.get("lastAffair"), dict) else None,
        "anonSex": int(rec.get("anonSex") or 0),
        "escort": escort_view(rec),
        "pregnancy": rec.get("pregnancy") or None,
        "memories": list(rec.get("memories") or []),
        "note": rec.get("note") or "",
    }


def escort_view(rec: dict) -> dict | None:
    if not rec.get("escortSeq"):
        return None
    last = rec.get("escortLast") if isinstance(rec.get("escortLast"), dict) else {}
    ag = rec.get("agenda") if isinstance(rec.get("agenda"), dict) else {}
    cur = (ag.get("event") or {}).get("escort") if ag.get("kind") == "escort" else None
    return {"paid": int(rec.get("escortPaid") or 0), "seq": int(rec.get("escortSeq") or 0),
            "lastSeq": int(last.get("seq") or 0), "lastEnd": int(last.get("end") or 0),
            "lastClients": int(last.get("clients") or 0), "lastPaid": int(last.get("paid") or 0),
            "starts": [int(t) for t in rec.get("escortStarts") or []],
            "active": {"seq": int(cur.get("seq") or 0), "clients": int(cur.get("clients") or 0), "startedAt": _ms(ag.get("startedAt")),
                       "until": _ms(ag.get("until"))} if cur else None}


def overlay(data: dict, store: dict, now_ms: int) -> None:
    """把 RP5 上正在走的生活蓋到這次讀到的存檔。手機帶來的行程不算。"""
    if not isinstance(data, dict):
        return
    girls = data.get("succubi") if isinstance(data.get("succubi"), list) else []
    by_id = {str(g.get("id")): g for g in girls if isinstance(g, dict) and g.get("id")}
    mirror = data.get("roomMirror") if isinstance(data.get("roomMirror"), dict) else None
    mirror_id = _mirror_id(mirror) if mirror else ""
    for gid, rec in (store.get("girls") or {}).items():
        row = view_of(rec)
        girl = by_id.get(gid)
        if girl is not None:
            _paint_world(girl, row)
        if mirror and mirror_id == gid and rec.get("phase") == "japan":
            mirror["present"] = False
            mg = mirror.get("girl") if isinstance(mirror.get("girl"), dict) else None
            if mg is not None:
                mg["roomVisitUntil"] = 0
                _paint_world(mg, row)


def _paint_world(girl: dict, row: dict) -> None:
    world = girl.get("world") if isinstance(girl.get("world"), dict) else {}
    if row.get("home"):
        world["home"] = {"id": row["home"]["id"], "name": row["home"]["name"]}
    if row.get("regionId"):
        world["regionId"] = row["regionId"]
    if row.get("job"):
        world["job"] = {"id": row["job"].get("id") or "", "name": row["job"].get("name") or ""}
    world["agenda"] = row.get("agenda")
    world["activity"] = row.get("activity") or None
    world["shift"] = row.get("shift")
    world["stroll"] = row.get("stroll")
    world["browse"] = row.get("browse")
    world["sleep"] = row.get("sleep")
    world["homeAct"] = row.get("homeAct")
    if row.get("phase") == "japan":
        # 人在日本時 RP5 是心情的真相；人在房裡時手機是（不蓋）
        world["mood"] = row.get("mood") or "平靜"
        world["moodLevel"] = int(row.get("moodLevel") or 0)
        world["moodAt"] = int(row.get("moodAt") or 0)
        world["moodWhy"] = row.get("moodWhy") or ""
    if row.get("met"):
        world["met"] = row["met"]
    if row.get("last"):
        world["lastOutside"] = row["last"]
    if row.get("scpSteps"):
        world["scpSteps"] = row["scpSteps"]
    if row.get("eroSteps"):
        world["eroSteps"] = row["eroSteps"]
    if row.get("hungerGiven"):
        world["lifeHungerGiven"] = max(int(world.get("lifeHungerGiven") or 0), int(row["hungerGiven"]))
    if row.get("hungerRelief"):
        world["lifeHungerRelief"] = max(int(world.get("lifeHungerRelief") or 0), int(row["hungerRelief"]))
    if row.get("loyaltyLoss"):
        world["lifeLoyaltyLoss"] = max(int(world.get("lifeLoyaltyLoss") or 0), int(row["loyaltyLoss"]))
    if row.get("traces"):
        world["lifeTraces"] = row["traces"]
    if row.get("lastAffair"):
        world["lastAffair"] = row["lastAffair"]
    if row.get("anonSex"):
        world["anonSex"] = row["anonSex"]
    if row.get("escort"):
        world["escort"] = row["escort"]
    if row.get("pregnancy"):
        world["pregnancyRp5"] = row["pregnancy"]
    world.pop("settlingHome", None)
    for item in row.get("memories") or []:
        if isinstance(item, dict) and item.get("id") and item.get("text"):
            _push_mind(world, item)
    girl["world"] = world


def public_snapshot(store: dict, now_ms: int) -> dict:
    girls = {}
    for gid, rec in (store.get("girls") or {}).items():
        girls[gid] = view_of(rec)
    return {"now": now_ms, "girls": girls}
