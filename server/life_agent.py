"""她人在日本時的生活。RP5 照真實時間走，網頁只看結果。

手機關著也算。一個時段結束就寫下那一件，下一件從當下起算。
不把關掉的那幾個小時壓成一次補完。
離開房間不是直接去打工。選到打工才是四小時。
"""

from __future__ import annotations

import random
import re
from datetime import datetime
from zoneinfo import ZoneInfo

_TOKYO = ZoneInfo("Asia/Tokyo")
_WEEKDAYS = "一二三四五六日"

HOUR_MS = 60 * 60 * 1000
WORK_MS = 4 * HOUR_MS
BROWSE_MS = 30 * 60 * 1000
STROLL_SHORT_MS = 30 * 60 * 1000
TEXT_CAP = 180

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

JOBS = [
    {"id": "konbini", "name": "便利商店的晚班"},
    {"id": "cashier", "name": "超市收銀"},
    {"id": "cafe-kitchen", "name": "咖啡店內場"},
    {"id": "izakaya", "name": "居酒屋端盤子"},
    {"id": "bookstore", "name": "書店整理書架"},
    {"id": "ramen", "name": "拉麵店洗碗"},
    {"id": "flyers", "name": "車站前發傳單"},
    {"id": "drugstore", "name": "藥妝店補貨"},
    {"id": "ryokan", "name": "溫泉旅館的房務"},
    {"id": "shrine", "name": "神社授與所"},
    {"id": "aquarium", "name": "水族館餵食"},
    {"id": "florist", "name": "花店包花"},
    {"id": "cinema", "name": "電影院賣票"},
    {"id": "cemetery", "name": "靈園的管理員助手"},
    {"id": "radio", "name": "午夜電台的接線"},
    {"id": "warehouse", "name": "倉庫夜班"},
]

KINDS = ("work", "stroll", "browse")


def new_store() -> dict:
    return {"girls": {}}


def duration_ms(kind: str, rnd=None) -> int:
    roll = rnd if rnd is not None else random.random
    if kind == "work":
        return WORK_MS
    if kind == "browse":
        return BROWSE_MS
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
        "agenda": None,
        "memories": [],
        "notedHome": False,
        "note": "",
    }


def _remember(rec: dict, kind: str, text: str, now_ms: int, keys: list | None = None) -> None:
    item = {
        "id": f"la{now_ms}{len(rec.get('memories') or [])}",
        "at": now_ms,
        "kind": kind if kind in ("home", "work", "stroll", "browse", "life") else "life",
        "text": clip_text(text),
        "keys": [str(k) for k in (keys or []) if k][:8],
        "place": rec.get("homeName") or "",
        "job": (rec.get("job") or {}).get("name") or "",
        "person": "",
        "mood": rec.get("mood") or "",
    }
    if not item["text"]:
        return
    rec.setdefault("memories", [])
    if any(isinstance(x, dict) and x.get("text") == item["text"] for x in rec["memories"][-6:]):
        return
    rec["memories"].append(item)
    rec["memories"] = rec["memories"][-40:]


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
        rec["mood"] = str(world.get("mood") or "")
        if home:
            rec["homeId"] = str(home.get("id") or "")
            rec["homeName"] = str(home.get("name") or "")
            if world.get("regionId"):
                rec["regionId"] = str(world.get("regionId") or "")
        job = world.get("job") if isinstance(world.get("job"), dict) else None
        if job and job.get("name") and not (rec.get("job") or {}).get("name"):
            rec["job"] = {"id": str(job.get("id") or ""), "name": str(job["name"])}
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
        elif rec.get("phase") != "japan" or not rec.get("homeId"):
            _enter_japan(rec, now_ms, roll)
        else:
            rec["phase"] = "japan"


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


def plan_tick(store: dict, now_ms: int) -> list[dict]:
    """這一輪只處理一個人。處理完才排下一件，不把欠的班一次補完。"""
    clock = japan_clock(now_ms)["line"]
    for gid, rec in (store.get("girls") or {}).items():
        if is_due(rec, now_ms):
            agenda = rec["agenda"]
            return [{
                "op": "resolve",
                "id": gid,
                "until": _ms(agenda.get("until")),
                "startedAt": _ms(agenda.get("startedAt")),
                "kind": agenda.get("kind") or "work",
                "name": rec.get("name") or "她",
                "homeName": rec.get("homeName") or "",
                "regionName": rec.get("regionName") or "",
                "job": (rec.get("job") or {}).get("name") or "",
                "hobbies": list(rec.get("hobbies") or []),
                "mood": rec.get("mood") or "",
                "clock": clock,
            }]
        if needs_choice(rec):
            return [{
                "op": "choose",
                "id": gid,
                "name": rec.get("name") or "她",
                "homeName": rec.get("homeName") or "",
                "regionName": rec.get("regionName") or "",
                "hobbies": list(rec.get("hobbies") or []),
                "mood": rec.get("mood") or "",
                "clock": clock,
            }]
    return []


def arm(rec: dict, kind: str, now_ms: int, rnd=None) -> dict:
    kind = kind if kind in KINDS else "stroll"
    ms = duration_ms(kind, rnd)
    rec["agenda"] = {"kind": kind, "until": now_ms + ms, "startedAt": now_ms}
    labels = {"work": "打工", "stroll": "溜達", "browse": "上網"}
    hours = ms / HOUR_MS
    span = "四小時" if kind == "work" else ("一小時" if ms >= HOUR_MS else "三十分鐘")
    rec["note"] = f"{rec.get('name') or '她'}在決定之後去{labels[kind]}，這趟{span}。"
    return rec["agenda"]


def apply_choice(store: dict, gid: str, kind: str, now_ms: int, rnd=None) -> bool:
    rec = (store.get("girls") or {}).get(gid)
    if not rec or rec.get("phase") != "japan" or not needs_choice(rec):
        return False
    if not kind:
        kind = KINDS[int(float((rnd or random.random)()) * len(KINDS)) % len(KINDS)]
    arm(rec, kind, now_ms, rnd)
    return True


def ensure_job(rec: dict, rnd=None) -> dict:
    if (rec.get("job") or {}).get("name"):
        return rec["job"]
    roll = rnd if rnd is not None else random.random
    job = JOBS[int(float(roll()) * len(JOBS)) % len(JOBS)]
    rec["job"] = {"id": job["id"], "name": job["name"]}
    return rec["job"]


def apply_resolve(store: dict, gid: str, finished_until: int, text: str, kind: str, now_ms: int, next_kind: str, rnd=None, extra_keys=None) -> bool:
    rec = (store.get("girls") or {}).get(gid)
    if not rec or rec.get("phase") != "japan":
        return False
    agenda = rec.get("agenda") if isinstance(rec.get("agenda"), dict) else None
    if not agenda or _ms(agenda.get("until")) != int(finished_until):
        return False
    _remember(rec, "browse" if kind == "browse" else ("stroll" if kind == "stroll" else "work"), text, now_ms, extra_keys)
    roll = rnd if rnd is not None else random.random
    if next_kind not in KINDS:
        next_kind = KINDS[int(float(roll()) * len(KINDS)) % len(KINDS)]
    arm(rec, next_kind, now_ms, roll)
    return True


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
    shift = stroll = browse = None
    if kind == "work" and until:
        activity = "work"
        shift = {"pending": True, "until": until}
    elif kind == "stroll" and until:
        activity = "wander"
        stroll = {"pending": True, "until": until}
    elif kind == "browse" and until:
        activity = "browse"
        browse = {"pending": True, "until": until, "placeName": rec.get("homeName") or ""}
    return {
        "id": rec.get("id") or "",
        "name": rec.get("name") or "",
        "phase": rec.get("phase") or "",
        "visitUntil": rec.get("visitUntil") or 0,
        "regionId": rec.get("regionId") or "",
        "home": {"id": rec.get("homeId") or "", "name": rec.get("homeName") or ""} if rec.get("homeId") else None,
        "job": rec.get("job"),
        "agenda": agenda if until else None,
        "activity": activity,
        "shift": shift,
        "stroll": stroll,
        "browse": browse,
        "memories": list(rec.get("memories") or []),
        "note": rec.get("note") or "",
    }


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
