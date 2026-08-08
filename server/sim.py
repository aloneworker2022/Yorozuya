"""召喚師交配環系統:伺服器端模擬(權威運算)。

把「判定妹子是否被召喚/約會 + 召喚師的 act」從玩家網頁搬到伺服器,持續運算——
手機關螢幕、切 app、離線都照跑。設計原則:

- 本模組只運算「數字/事件」(擲骰、交配、階段推進、taken 時效),act 的『文字』一律留 null,
  由手機在觀戰/詢問時才即時生成(核心零檢視內容原則不變)。
- 伺服器擁有自己的資料表(sim),絕不碰手機的存檔 blob(save)。手機仍是存檔唯一寫入者。
  手機把召喚師狀態當「唯讀鏡像」顯示;會改到模擬的玩家動作(看過/掙脫/破除纏身)以 patch 回報。
- 結局(懷孕娶走)會移除魅魔,這動到名冊=存檔,故伺服器只記 outcome,由手機套用。
- 破除纏身(patch clear):寫 mem[girl][summonerId]=階段後拔 rel;下次同類型再纏上接續。

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
# 未纏上:每 30 分鐘一輪,依稀有度決定被纏上機率(越稀有越容易被召喚師盯上;SSR 必定)
ENTANGLE_CHANCE = {"N": 1 / 5, "R": 1 / 4, "S": 1 / 3, "SS": 1 / 2, "SSR": 1.0}
DEFAULT_ENTANGLE = 1 / 5               # 未知稀有度時的保底(比照 N)
# 已纏上:每 30 分鐘一輪,依稀有度決定被召喚/約會機率(越稀有越常被召喚;SSR 必定)
TAKEN_CHANCE = {"N": 1 / 3, "R": 1 / 3, "S": 1 / 2, "SS": 1 / 2, "SSR": 1.0}
DEFAULT_TAKEN = 1 / 3                   # 未知稀有度時的保底(比照 N)
ACT_CAP = 60                            # 每隻魅魔保留的互動紀錄上限
WIN30_MS = 30 * 60 * 1000              # 纏上判定的 30 分鐘窗(對齊整點與 30 分,等同旗標清除)

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


def remember_rel(store, gid, rel):
    """破除纏身時記住「這隻魅魔 × 這位召喚師」的階段,下次同類型再纏上會接續。"""
    if not rel or not gid:
        return
    sid = rel.get("id")
    if not sid:
        return
    stg = min(5, max(0, int(rel.get("stage") or 0)))
    store.setdefault("mem", {}).setdefault(gid, {})[sid] = {
        "stage": stg,
        "matingCount": int(rel.get("matingCount") or 0),
        "ringUnlocked": bool(rel.get("ringUnlocked")),
        "kinks": list(rel.get("kinks") or []),
    }


def mem_of(store, gid, su_id):
    return (store.get("mem") or {}).get(gid, {}).get(su_id)


def clear_rel(store, gid, now_ms=None):
    """解除召喚師纏身:寫入 mem 後拔掉 rel;本 30 分窗不再被立刻重纏。"""
    rel = store.get("rels", {}).get(gid)
    if not rel:
        return False
    remember_rel(store, gid, rel)
    store["rels"].pop(gid, None)
    store.get("takenWin", {}).pop(gid, None)
    if now_ms is not None:
        store.setdefault("judgeWin", {})[gid] = now_ms // WIN30_MS
    return True


def make_rel(su_id, now_ms, mem=None):
    """新建召喚師關係;若有同類型記憶(破除後再纏),接續 stage / 解環 / 性趣。"""
    _, kinks = load_content()
    names = [k["name"] for k in kinks]
    stg = 0
    mating = 0
    ring = False
    kink_list = sample_n(names, rand_int(4, 10)) if names else []
    if mem:
        stg = min(5, max(0, int(mem.get("stage") or 0)))
        mating = int(mem.get("matingCount") or 0)
        ring = bool(mem.get("ringUnlocked"))
        if mem.get("kinks"):
            kink_list = list(mem["kinks"])
    return {
        "id": su_id, "sinceDay": day_num(now_ms), "stage": stg,
        "resist": STAGE_RESIST[stg],
        "matingCount": mating, "ringUnlocked": ring,
        "kinks": kink_list, "taken": None, "acts": [],
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
        store.get("takenWin", {}).pop(gid, None)
        changed = True
    elif now_ms >= tk["until"]:
        rel["taken"] = None                                  # 解召喚
        store.setdefault("takenWin", {})[gid] = now_ms // WIN30_MS   # 解召喚後,下一輪(30分)才再判定
        changed = True
    return changed


def _tick_girl(store, gid, now_ms):
    """每次 tick(sync 每 15 秒 / worker 每 60 秒)對一隻魅魔跑一次。判定用「時窗旗標」擋重複:
    - 纏上:每 30 分鐘一輪(對齊整點/30分),同輪只判一次;不是看板娘(且非 NTR)才判,1/5 命中。
    - 已纏上未被召喚:每「小時」一輪判定是否被召喚/約會(TAKEN_CHANCE)。
    - 被召喚中:只生 act、等時效解召喚,不重判。"""
    meta = store.get("roster", {}).get(gid, {})
    ntr = bool(meta.get("ntr"))
    kanban = bool(meta.get("kanban"))
    busy = bool(meta.get("busy"))
    rarity = meta.get("rarity")
    rel = store["rels"].get(gid)

    # ── 未纏上 → 纏上判定 ──
    if not rel:
        win = now_ms // WIN30_MS                 # 30 分鐘窗編號(對齊整點/30分)= 判定旗標
        jw = store.setdefault("judgeWin", {})
        if (kanban or ntr) or jw.get(gid) == win:
            return False                          # 看板娘/NTR中,或這一輪已判過 → 略過
        jw[gid] = win                             # 標記本輪已判(不論成敗)
        if random.random() < ENTANGLE_CHANCE.get(rarity, DEFAULT_ENTANGLE):
            sums, _ = load_content()
            if sums:
                su = pick(sums)
                prev = mem_of(store, gid, su["id"])
                store["rels"][gid] = make_rel(su["id"], now_ms, prev)
                store.setdefault("takenWin", {})[gid] = now_ms // WIN30_MS   # 纏上當下這輪先不召喚
                outcome = {"type": "entangled", "id": gid, "suName": su.get("name"), "t": now_ms}
                if prev:
                    outcome["resumed"] = True
                    outcome["stage"] = store["rels"][gid].get("stage", 0)
                store.setdefault("outcomes", []).append(outcome)
                return True
        return False

    # ── 已纏上、被召喚中 → 生 act / 到期解召喚 ──
    if rel.get("taken"):
        return _process_taken(store, gid, rel, now_ms)

    # ── 已纏上、未被召喚 → 每 30 分鐘一輪判定是否召喚/約會(對齊整點/30分)──
    winT = now_ms // WIN30_MS
    tw = store.setdefault("takenWin", {})
    if (ntr or busy) or tw.get(gid) == winT:
        return False
    tw[gid] = winT
    if random.random() < TAKEN_CHANCE.get(rarity, DEFAULT_TAKEN):
        su = summoner_by_id(rel["id"])
        is_date = random.random() < ((su or {}).get("dateChance", 0.5))
        loc = None
        if is_date:
            spots = (su or {}).get("spots") or []
            loc = pick(spots)["name"] if spots else pick(DEFAULT_SPOTS)
        dur = 1 if is_date else rand_int(2, 5)     # 約會 1 小時;召喚 2~5 小時
        rel["taken"] = {"type": "date" if is_date else "kanban", "location": loc,
                        "until": now_ms + dur * HOUR, "actAt": now_ms}
        # 召喚當下立刻結算第一小時的 act 額度(3~5 slot),不要等到下一輪 tick 才預生
        # ——否則玩家秒進觀戰會撞上空佇列、全走 live_act 現生,體感像「沒有預先產生」。
        return _process_taken(store, gid, rel, now_ms) or True
    return False


def adopt_seeds(store, seeds):
    """伺服器尚未追蹤該魅魔(冷啟/資料遺失)時,採用手機送來的既有召喚師關係當種子。"""
    for gid, rel in (seeds or {}).items():
        if rel and gid not in store["rels"]:
            store["rels"][gid] = rel


def apply_patches(store, patches, now_ms=None):
    """玩家動作回報:標記看過、回填已生成的 act 文字、掙脫召喚、破除纏身(clear)。"""
    now_ms = int(now_ms if now_ms is not None else time.time() * 1000)
    for gid, p in (patches or {}).items():
        # 破除纏身:可在無 rel 時略過;有 rel 則寫 mem 後拔掉(不必先有 taken)
        if p.get("clear") or p.get("sever"):
            clear_rel(store, gid, now_ms)
            continue
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


def _tick_clock(store, now_ms):
    """伺服器權威時鐘:純計時器,不算遊戲後果。判定「看板娘到期 / 委託逾期 / 跨日」是否觸發,
    觸發就寫進 outcomes 交手機套用(手機仍是存檔唯一寫入者,後果邏輯一律留在手機端,零 Python↔JS 分歧)。
    kanbans / quests 的計時清單由手機每次 sync 覆蓋上傳;觸發後移除該計時,避免重複(手機套用具冪等性,重覆亦無害)。"""
    clock = store.setdefault("clock", {"kanbans": {}, "quests": {}, "lastDay": None})
    changed = False
    # ── 看板娘到期解除 ──
    for kid, until in list(clock.get("kanbans", {}).items()):
        if until is not None and now_ms >= until:
            store.setdefault("outcomes", []).append({"type": "kanban_expired", "id": kid, "t": now_ms})
            clock["kanbans"].pop(kid, None)
            changed = True
    # ── 執行中委託逾期違約 ──
    for qid, deadline in list(clock.get("quests", {}).items()):
        if deadline is not None and now_ms >= deadline:
            store.setdefault("outcomes", []).append({"type": "quest_due", "id": qid, "t": now_ms})
            clock["quests"].pop(qid, None)
            changed = True
    # ── 跨日:一則 day_rollover 讓手機跑 settleDays + ensureShop(每日結算/需求/NTR/商店重擲全含)──
    today = day_num(now_ms)
    last = clock.get("lastDay")
    if last is not None and today > last:
        store.setdefault("outcomes", []).append({"type": "day_rollover", "to": today, "t": now_ms})
        changed = True
    if last is None or today > last:
        clock["lastDay"] = today
        changed = True
    return changed


def world_stats(store):
    """世界時鐘心跳用的統計快照。"""
    rels = store.get("rels", {})
    clock = store.get("clock", {})
    return {
        "roster": len(store.get("roster", {})),
        "rels": len(rels),
        "taken": sum(1 for r in rels.values() if r and r.get("taken")),
        "kanbanTimers": len(clock.get("kanbans", {})),
        "questTimers": len(clock.get("quests", {})),
        "pendingOutcomes": len(store.get("outcomes", [])),
    }


def run_tick(store, now_ms):
    """依 roster 快照把所有魅魔補算到 now,並跑權威時鐘的計時判定;回傳是否有變化。"""
    changed = False
    store.setdefault("rels", {})
    store.setdefault("judgeWin", {})
    store.setdefault("takenWin", {})
    if _tick_clock(store, now_ms):
        changed = True
    for gid in list(store.get("roster", {}).keys()):
        if _tick_girl(store, gid, now_ms):
            changed = True
    # 名冊已無的魅魔(消失/被娶走/被獻祭):清掉關係、記憶與判定旗標
    roster = store.get("roster", {})
    for gid in list(store["rels"].keys()):
        if gid not in roster:
            store["rels"].pop(gid, None)
            changed = True
    for m in ("judgeWin", "takenWin", "mem"):
        bucket = store.get(m) or {}
        for gid in list(bucket.keys()):
            if gid not in roster:
                bucket.pop(gid, None)
                changed = True
    return changed


def new_store():
    return {"rels": {}, "roster": {}, "rating": "sfw", "outcomes": [], "judgeWin": {}, "takenWin": {},
            "mem": {},  # {girlId: {summonerId: {stage, matingCount, ringUnlocked, kinks}}}
            "clock": {"kanbans": {}, "quests": {}, "lastDay": None}}
