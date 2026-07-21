"""召喚師交配環系統:伺服器端模擬(權威運算)。

把「判定妹子是否被召喚/約會 + 召喚師的 act」從玩家網頁搬到伺服器,持續運算——
手機關螢幕、切 app、離線都照跑。設計原則:

- 本模組只運算「數字/事件」(擲骰、交配、階段推進、taken 時效),act 的『文字』一律留 null,
  由手機在觀戰/詢問時才即時生成(核心零檢視內容原則不變)。
- 伺服器擁有自己的資料表(sim),絕不碰手機的存檔 blob(save)。手機仍是存檔唯一寫入者。
  手機把召喚師狀態當「唯讀鏡像」顯示;會改到模擬的玩家動作(看過/掙脫)以 patch 回報。
- 結局(懷孕娶走)會移除魅魔,這動到名冊=存檔,故伺服器只記 outcome,由手機套用。

常數與邏輯與 web/app.js 的客戶端版本一一對應,是同一套規則的權威實作。
"""

import json
import math
import random
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "web" / "content"
HOUR = 3600 * 1000

# ── 交配環常數(對應 app.js)──
STAGE_RESIST = [40, 20, 10, 10, 5, 1]   # 各階段抵抗值(=交配機率分母 1/resist)
STAGE_ADVANCE = [2, 3, 5, 5]            # ⓪~③ 交配 N 次推進
CONFESS_CHANCE = 1 / 5                  # ④ 每次交配 1/5 告白升女友
FIANCEE_MATINGS = 20                    # ⑤ 累積 20 次交配解環
PREGNANCY_CHANCE = 1 / 2               # 解環後每次內射 1/2 懷孕娶走
DRAW_CHANCE = 1 / 20                    # 未纏上:每 drawIvlH 小時 1/20 被纏上
TAKEN_CHANCE = 1 / 3                    # 已纏上:每小時 1/3 被召喚
ACT_CAP = 60                            # 每隻魅魔保留的互動紀錄上限

DEFAULT_SPOTS = ["咖啡廳", "夜景展望台", "海邊", "電影院", "遊樂園"]


def rand_int(lo, hi):
    return lo + math.floor(random.random() * (hi - lo + 1))


def pick(arr):
    return arr[math.floor(random.random() * len(arr))]


def uid():
    return format(int(time.time() * 1000), "x") + "".join(
        random.choice("0123456789abcdefghijklmnopqrstuvwxyz") for _ in range(6)
    )


def day_num(now_ms):
    return int(now_ms // 86400000)


def sample_n(arr, n):
    a = list(arr)
    random.shuffle(a)
    return a[: min(n, len(a))]


# ── 內容(召喚師/性趣)自 content 檔讀取,短暫快取 ──
_cache = {"summoners": None, "kinks": None, "t": 0.0}


def load_content():
    now = time.time()
    if _cache["summoners"] is None or now - _cache["t"] > 30:
        try:
            _cache["summoners"] = json.loads((CONTENT / "summoners.json").read_text("utf-8")).get("summoners", [])
        except Exception:
            _cache["summoners"] = []
        try:
            _cache["kinks"] = json.loads((CONTENT / "kinks.json").read_text("utf-8")).get("kinks", [])
        except Exception:
            _cache["kinks"] = []
        _cache["t"] = now
    return _cache["summoners"], _cache["kinks"]


def summoner_by_id(sid):
    sums, _ = load_content()
    for s in sums:
        if s.get("id") == sid:
            return s
    return None


def make_rel(su_id, now_ms):
    _, kinks = load_content()
    names = [k["name"] for k in kinks]
    return {
        "id": su_id, "sinceDay": day_num(now_ms), "stage": 0, "resist": STAGE_RESIST[0],
        "matingCount": 0, "ringUnlocked": False,
        "kinks": sample_n(names, rand_int(4, 10)) if names else [], "taken": None, "acts": [],
    }


def push_rec(rel, rec):
    acts = rel.setdefault("acts", [])
    acts.append({"id": uid(), "text": None, "seen": False, **rec})
    if len(acts) > ACT_CAP:
        del acts[: len(acts) - ACT_CAP]


def advance_stage(rel):
    rel["stage"] = min(5, rel.get("stage", 0) + 1)
    rel["resist"] = STAGE_RESIST[rel["stage"]]
    rel["matingCount"] = 0


def do_mating(rel, now_ms):
    """一次交配:生起承合三則(算一次),依階段推進/告白/解環/懷孕。回傳是否被娶走。"""
    pool = rel.get("kinks") or [k["name"] for k in load_content()[1]]
    kink = pick(pool) if pool else "交合"
    mating_id = uid()
    ring_locked = not rel.get("ringUnlocked")
    for beat in ["起", "承", "合"]:
        push_rec(rel, {"t": now_ms, "kind": "mating", "matingId": mating_id, "beat": beat,
                       "kinkName": kink, "ring": ring_locked})
    rel["matingCount"] = rel.get("matingCount", 0) + 1
    stg = rel.get("stage", 0)
    if stg <= 3:
        if rel["matingCount"] >= STAGE_ADVANCE[stg]:
            advance_stage(rel)
    elif stg == 4:
        if random.random() < CONFESS_CHANCE:
            advance_stage(rel)
    elif stg == 5:
        if not rel.get("ringUnlocked") and rel["matingCount"] >= FIANCEE_MATINGS:
            rel["ringUnlocked"] = True
        if rel.get("ringUnlocked") and random.random() < PREGNANCY_CHANCE:
            return True
    return False


def process_act_slot(rel, now_ms, rating):
    """一個 act slot:NSFW 才擲交配(1/resist),中=交配(3則)、沒中=猥褻(1則);每 slot 抵抗 −1。"""
    rel.setdefault("stage", 0)
    if rel.get("resist") is None:
        rel["resist"] = STAGE_RESIST[rel["stage"]]
    nsfw = rating == "nsfw"
    removed = False
    if nsfw and random.random() < 1 / max(1, rel["resist"]):
        removed = do_mating(rel, now_ms)
    else:
        tk = rel.get("taken") or {}
        push_rec(rel, {"t": now_ms, "kind": "flirt", "type": tk.get("type", "kanban"),
                       "location": tk.get("location")})
    rel["resist"] = max(1, rel["resist"] - 1)
    return removed


def _process_taken(store, gid, rel, now_ms):
    """taken 持續狀態:每小時生 3~5 個 act slot(離線補算);到期解召喚。回傳是否有變化。"""
    tk = rel["taken"]
    if tk.get("until") is None:
        tk["until"] = now_ms + rand_int(2, 5) * HOUR
    if tk.get("actAt") is None:
        tk["actAt"] = now_ms
    guard = 0
    married = False
    changed = False
    while tk["actAt"] <= now_ms and tk["actAt"] < tk["until"] and guard < 200:
        guard += 1
        for _ in range(rand_int(3, 5)):
            if process_act_slot(rel, tk["actAt"], store.get("rating", "sfw")):
                married = True
                break
        tk["actAt"] += HOUR
        changed = True
        if married:
            break
    if married:
        su = summoner_by_id(rel["id"])
        store.setdefault("outcomes", []).append(
            {"type": "married", "id": gid, "suName": su.get("name") if su else None, "t": now_ms})
        store["rels"].pop(gid, None)
        store.get("sched", {}).pop(gid, None)
        changed = True
    elif now_ms >= tk["until"]:
        rel["taken"] = None
        changed = True
    return changed


def _tick_girl(store, gid, now_ms):
    rating = store.get("rating", "sfw")
    meta = store.get("roster", {}).get(gid, {})
    ntr = bool(meta.get("ntr"))
    kanban = bool(meta.get("kanban"))
    busy = bool(meta.get("busy"))
    sched_map = store.setdefault("sched", {})
    if sched_map.get(gid) is None:
        div = rand_int(2, 5)
        sched_map[gid] = {"drawIvlH": div, "nextDraw": now_ms + div * HOUR}
    sched = sched_map[gid]
    changed = False
    rolls = 0
    while now_ms >= sched["nextDraw"] and rolls < 60:
        rolls += 1
        at = sched["nextDraw"]
        rel = store["rels"].get(gid)
        step = HOUR if rel else sched["drawIvlH"] * HOUR
        if not rel:
            if not (ntr or kanban or busy) and random.random() < DRAW_CHANCE:
                sums, _ = load_content()
                if sums:
                    su = pick(sums)
                    store["rels"][gid] = make_rel(su["id"], at)
                    store.setdefault("outcomes", []).append(
                        {"type": "entangled", "id": gid, "suName": su.get("name"), "t": at})
        elif rel.get("taken"):
            pass  # 被召喚中不重判,等時效
        elif not ntr and not busy and random.random() < TAKEN_CHANCE:
            su = summoner_by_id(rel["id"])
            is_date = random.random() < ((su or {}).get("dateChance", 0.5))
            loc = None
            if is_date:
                spots = (su or {}).get("spots") or []
                loc = pick(spots)["name"] if spots else pick(DEFAULT_SPOTS)
            dur = 1 if is_date else rand_int(2, 5)
            rel["taken"] = {"type": "date" if is_date else "kanban", "location": loc,
                            "until": at + dur * HOUR, "actAt": at}
        sched["nextDraw"] += step
        changed = True
    rel = store["rels"].get(gid)
    if sched["nextDraw"] <= now_ms:
        sched["nextDraw"] = now_ms + (HOUR if rel else sched["drawIvlH"] * HOUR)
        changed = True
    if rel and rel.get("taken"):
        if _process_taken(store, gid, rel, now_ms):
            changed = True
    return changed


def adopt_seeds(store, seeds):
    """伺服器尚未追蹤該魅魔(冷啟/資料遺失)時,採用手機送來的既有召喚師關係當種子。"""
    for gid, rel in (seeds or {}).items():
        if rel and gid not in store["rels"]:
            store["rels"][gid] = rel


def apply_patches(store, patches):
    """玩家動作回報:標記看過、回填已生成的 act 文字、掙脫召喚。"""
    for gid, p in (patches or {}).items():
        rel = store["rels"].get(gid)
        if not rel:
            continue
        seen = set(p.get("seen") or [])
        texts = p.get("texts") or {}
        for a in rel.get("acts", []):
            if a["id"] in seen:
                a["seen"] = True
            if a["id"] in texts and not a.get("text"):
                a["text"] = texts[a["id"]]
        if p.get("rescue") and rel.get("taken"):
            rel["taken"] = None


def run_tick(store, now_ms):
    """依 roster 快照把所有魅魔補算到 now;回傳是否有變化。"""
    changed = False
    store.setdefault("rels", {})
    store.setdefault("sched", {})
    for gid in list(store.get("roster", {}).keys()):
        if _tick_girl(store, gid, now_ms):
            changed = True
    # 名冊已無的魅魔(消失/被娶走/被獻祭):清掉關係與排程
    roster = store.get("roster", {})
    for gid in list(store["rels"].keys()):
        if gid not in roster:
            store["rels"].pop(gid, None)
            changed = True
    for gid in list(store["sched"].keys()):
        if gid not in roster:
            store["sched"].pop(gid, None)
    return changed


def new_store():
    return {"rels": {}, "sched": {}, "roster": {}, "rating": "sfw", "outcomes": []}
