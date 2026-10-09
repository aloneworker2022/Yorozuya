"""交友線（2026-10-10，新系統；跟退役的 NTR_ON／SUMMONER／CRAVE 無關，也取代 2026-10-05 以前手機上的「外面朋友線」）。

建在 life_agent 的 `met`（打工／溜達碰到的人）上，不開新的認識管道。純函式：不碰檔案、不叫模型。
數字同步寫在 web/content/life_friends.js，tests/life_agent_test.py 會比對。

每個人五階＋頂：見過 → 認識 → 朋友 → 曖昧 → 肉體 → 炮友。
- 每次「再碰到」最多往前一步（擲一次）。同事最好走、顧客次之、路人最難。
- 只有「朋友」會退（太久沒碰到／吵架）；曖昧、肉體、炮友永遠不退。
- 到「認識」時決定對方的意圖：單純友善（最多到朋友）／想追她／只想上床／危險人物（比較強勢、會一直慫恿，
  但一定是她自己點頭或半推半就——沒有非自願）。
- 越線（朋友→曖昧、曖昧→肉體）和之後每次上床，都乘上：她對召喚者的關係階＋忠誠（女友起大打折、忠誠越高越難，
  妻子＋高忠誠幾乎不會）、她現在的性飢渴（強烈拉高）、心情、個性。
懷孕／生產、被發現後原諒或懲罰都不在這版。
"""
from __future__ import annotations

STAGES = ("seen", "known", "friend", "flirt", "physical", "fwb")
STAGE_ZH = {"seen": "見過", "known": "認識", "friend": "朋友", "flirt": "曖昧", "physical": "肉體", "fwb": "炮友"}
NEVER_BACK = ("flirt", "physical", "fwb")

ROLE_EASE = {"同事": 1.0, "顧客": 0.6, "路人": 0.45}
# 往下一階的基準機率（再乘 ROLE_EASE；越線的兩步再乘 cross_mult）
STEP_BASE = {"seen": 0.5, "known": 0.6, "friend": 0.4, "flirt": 0.4, "physical": 0.4}
FWB_AFTER_SEX = 3            # 肉體至少做過 3 次才可能變炮友
SEX_BASE = {"physical": 0.35, "fwb": 0.55}   # 已經肉體／炮友：再碰到時又做一次的機率（再乘 cross_mult）

INTENTS = (
    {"id": "friendly", "name": "單純友善", "weight": 0.4, "flirt": 0.0, "physical": 0.0},
    {"id": "court", "name": "想追她", "weight": 0.3, "flirt": 1.3, "physical": 1.0},
    {"id": "lust", "name": "只想上床", "weight": 0.2, "flirt": 1.2, "physical": 1.6},
    {"id": "danger", "name": "危險人物", "weight": 0.1, "flirt": 1.8, "physical": 1.8},
)
INTENT_BY_ID = {i["id"]: i for i in INTENTS}

# 她對召喚者的關係（hunger.js stageBand 同一套）
STAGE_ORDER = ("stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate",
               "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife")
BAND_GATE = {"reserved": 1.0, "friend": 0.85, "dating": 0.25, "wife": 0.08}
LOYALTY_K = {"reserved": 0.2, "friend": 0.3, "dating": 0.6, "wife": 0.9}   # 忠誠 100 時再打掉多少
MOOD_CROSS = {"臉紅心跳": 1.4, "愉快": 1.15, "低落": 1.1, "心虛": 0.9, "不悅": 0.8, "不安": 0.6, "虛脫": 0.5}
PERSONALITY_FAMILY = {"高冷": "冷淡", "傲嬌": "冷淡", "文靜溫柔": "溫柔", "御姊": "溫柔", "活潑開朗": "熱絡",
                      "天然呆": "熱絡", "病嬌": "佔有", "清純反差": "反差"}
FAMILY_CROSS = {"熱絡": 1.2, "反差": 1.3, "溫柔": 1.0, "冷淡": 0.8, "佔有": 0.9}

FRIEND_REGRESS_DAYS = 14     # 朋友太久沒碰到：再碰到時 50% 退回認識
FRIEND_REGRESS_CHANCE = 0.5
FRIEND_FIGHT_REGRESS = 0.3   # 朋友之間吵架／被責怪：30% 退回認識

SEX_HUNGER_RELIEF = 30       # 跟外面的人做一次：飢渴 −30
LOYALTY_PER_SEX = 1          # 每次上床忠誠 −1

# 光著身子離開房間（B）
NAKED_CHANCE = 0.7
NAKED_MAX = 15
LIBIDO_NAKED = {"N": 0.7, "R": 0.85, "S": 1.0, "SS": 1.2, "SSR": 1.4}
NAKED_STRANGER = 0.6         # 有認識的人時：陌生人 60％／認識的人 40％
CLOSENESS = {"fwb": 4.0, "physical": 3.0, "flirt": 2.5, "friend": 2.0, "known": 1.0}
NAKED_ANON_BELOW = 5         # 陌生人：<5 次就走了，不認識
NAKED_FWB_ABOVE = 10         # >10 次：陌生人直接變炮友；肉體的人升炮友


def stage_band(stage_key: str) -> str:
    try:
        i = STAGE_ORDER.index(str(stage_key or "stranger"))
    except ValueError:
        i = 0
    return "wife" if i >= 7 else "dating" if i >= 4 else "friend" if i >= 2 else "reserved"


def stage_of(row: dict) -> str:
    st = row.get("stage")
    if st in STAGES:
        return st
    return "known" if row.get("named") else "seen"


def rank(stage: str) -> int:
    return STAGES.index(stage) if stage in STAGES else 0


def hunger_mult(hunger: float) -> float:
    """飢渴 0 → ×0.4、50 → ×0.97、100 → ×2.0（強烈）。"""
    h = max(0.0, min(100.0, float(hunger or 0))) / 100
    return 0.4 + 1.6 * h ** 1.5


def gate(stage_key: str, loyalty: float) -> float:
    band = stage_band(stage_key)
    lo = max(0.0, min(100.0, float(loyalty if loyalty is not None else 60)))
    return BAND_GATE[band] * (1 - LOYALTY_K[band] * lo / 100)


def cross_mult(stage_key: str, loyalty: float, hunger: float, mood: str, archetype: str) -> float:
    fam = PERSONALITY_FAMILY.get(archetype or "", "溫柔")
    return gate(stage_key, loyalty) * hunger_mult(hunger) * MOOD_CROSS.get(mood or "", 1.0) * FAMILY_CROSS.get(fam, 1.0)


def pick_intent(rnd) -> str:
    total = sum(i["weight"] for i in INTENTS)
    r = float(rnd()) * total
    for i in INTENTS:
        r -= i["weight"]
        if r < 0:
            return i["id"]
    return INTENTS[-1]["id"]


def step_chance(row: dict, ctx: dict) -> float:
    """這次再碰到往下一階的機率。ctx = {stage, loyalty, hunger, mood, archetype}。"""
    st = stage_of(row)
    if st == "fwb":
        return 0.0
    ease = ROLE_EASE.get(row.get("role") or "路人", 0.45)
    base = STEP_BASE[st] * ease
    if st in ("friend", "flirt"):
        intent = INTENT_BY_ID.get(row.get("intent") or "friendly", INTENTS[0])
        key = "flirt" if st == "friend" else "physical"
        base *= intent[key] * cross_mult(ctx.get("stage"), ctx.get("loyalty"), ctx.get("hunger"), ctx.get("mood"), ctx.get("archetype"))
    elif st == "physical":
        if int(row.get("sexCount") or 0) < FWB_AFTER_SEX:
            return 0.0
        base *= gate(ctx.get("stage"), ctx.get("loyalty"))
    return max(0.0, min(0.95, base))


def sex_chance(row: dict, ctx: dict) -> float:
    st = stage_of(row)
    if st not in SEX_BASE:
        return 0.0
    c = SEX_BASE[st] * cross_mult(ctx.get("stage"), ctx.get("loyalty"), ctx.get("hunger"), ctx.get("mood"), ctx.get("archetype"))
    return max(0.0, min(0.9, c))


def advance(row: dict, ctx: dict, now_ms: int, rnd, act_id: str = "", know: bool = False) -> dict:
    """再碰到一次：最多走一步。回 {from, to, sex, regress}；不改 row（settle 才寫）。"""
    st = stage_of(row)
    out = {"from": st, "to": st, "sex": False, "regress": False}
    if st == "seen":
        if know or float(rnd()) < step_chance(row, ctx):
            out["to"] = "known"
        return out
    if st == "friend":
        last = int(row.get("lastAt") or 0)
        long_gap = last and now_ms - last > FRIEND_REGRESS_DAYS * 24 * 3600 * 1000
        if (long_gap and float(rnd()) < FRIEND_REGRESS_CHANCE) or (act_id in ("argue", "blame") and float(rnd()) < FRIEND_FIGHT_REGRESS):
            out["to"], out["regress"] = "known", True
            return out
    if st in ("physical", "fwb"):
        # 先看會不會升炮友，再看這次有沒有又做
        if st == "physical" and float(rnd()) < step_chance(row, ctx):
            out["to"], out["sex"] = "fwb", True
            return out
        if float(rnd()) < sex_chance(row, ctx):
            out["sex"] = True
        return out
    if float(rnd()) < step_chance(row, ctx):
        out["to"] = STAGES[rank(st) + 1]
        out["sex"] = out["to"] == "physical"
    return out


def apply_step(row: dict, step: dict, now_ms: int, rnd) -> None:
    """把 advance 的結果寫進 met 那一列。"""
    to = step.get("to") or stage_of(row)
    if rank(to) < rank(stage_of(row)) and stage_of(row) in NEVER_BACK:
        to = stage_of(row)  # 保險：曖昧以上永不退
    row["stage"] = to
    if rank(to) >= rank("known"):
        row["named"] = True
        if not row.get("intent"):
            row["intent"] = step.get("intent") or pick_intent(rnd)
    if step.get("sex"):
        row["sexCount"] = int(row.get("sexCount") or 0) + int(step.get("rounds") or 1)
        row["lastSexAt"] = now_ms
    if rank(to) > rank(step.get("from") or "seen"):
        row["stageAt"] = now_ms


# ───────────────────────── B：光著身子離開房間 ─────────────────────────
def naked_count(hunger: float, libido: str, rnd) -> int:
    """這一趟連續幾次（1～15）。飢渴、性慾越高越多。"""
    k = 2.0 / (LIBIDO_NAKED.get(str(libido or "R").upper(), 0.85) * (0.5 + max(0.0, min(100.0, float(hunger or 0))) / 100))
    return 1 + int((NAKED_MAX - 1) * float(rnd()) ** k + 0.5)


def naked_pick(met: list, rnd) -> dict | None:
    """回 None＝陌生人；不然是 met 裡的一列（認識以上、有名字的才算）。"""
    known = [m for m in met or [] if isinstance(m, dict) and rank(stage_of(m)) >= rank("known") and not m.get("anon")]
    if not known or float(rnd()) < NAKED_STRANGER:
        return None
    total = sum(CLOSENESS.get(stage_of(m), 1.0) for m in known)
    r = float(rnd()) * total
    for m in known:
        r -= CLOSENESS.get(stage_of(m), 1.0)
        if r < 0:
            return m
    return known[-1]


def naked_result(partner: dict | None, count: int) -> str:
    """這一趟之後跟對方的關係：anon（陌生人、沒留下）／physical／fwb。"""
    if partner is None:
        if count < NAKED_ANON_BELOW:
            return "anon"
        return "fwb" if count > NAKED_FWB_ABOVE else "physical"
    st = stage_of(partner)
    if st == "fwb":
        return "fwb"
    if st == "physical":
        return "fwb" if count > NAKED_FWB_ABOVE else "physical"
    return "physical"


def naked_relief(count: int) -> int:
    return min(100, 20 + 8 * int(count))


def naked_loyalty(count: int) -> int:
    return LOYALTY_PER_SEX + int(count) // 5


# ───────────────────────── prompt 用的句子 ─────────────────────────
STEP_TEXT = {
    "known": "互相知道了名字，打招呼、聊了幾句。",
    "friend": "約出來見面，或互傳訊息聊天，變成朋友。",
    "flirt": "越線了一點：牽手、接吻或摸來摸去，但還沒有上床。",
    "physical": "你們上床了（或在隱密的地方做了）。",
    "fwb": "你們又做了，而且說好以後想要就約——成了炮友。",
}
CONSENT_RULE = ("這是你自己願意的，或是半推半就地答應了；對方沒有強迫你，你想拒絕是可以拒絕的。"
                "寫得撩人但不露骨：不要描寫性器官或過程細節。不要寫強迫、下藥、昏迷、非自願。")
DANGER_RULE = "對方比較強勢、一直慫恿你、很會說話，但最後是你自己點頭的。"
GUILT_RULE = "你心裡知道這樣對不起召喚者，事後有點心虛、罪惡感，但沒有說出口。"
CONSENT_BAN_RE = r"強迫|強暴|強姦|迷姦|非自願|下藥|昏迷|硬上|掙扎不了|不顧我的反對"


def bond_lines(step: dict, who: str, intent: str, band: str) -> list[str]:
    to = step.get("to")
    lines = []
    if step.get("regress"):
        return [f"你和{who}好一陣子沒聯絡（或剛鬧了不愉快），感覺沒那麼熟了，退回點頭之交。"]
    if to != step.get("from"):
        lines.append(f"這次你和{who}的關係往前走了一步（{STAGE_ZH.get(step.get('from'), '')}→{STAGE_ZH.get(to, '')}）：{STEP_TEXT.get(to, '')}")
    elif step.get("sex"):
        lines.append(f"你和{who}本來就有肉體關係，這次又做了。")
    if to in ("flirt", "physical", "fwb") or step.get("sex"):
        lines.append(CONSENT_RULE)
        if intent == "danger":
            lines.append(DANGER_RULE)
        if band in ("dating", "wife"):
            lines.append(GUILT_RULE)
    return lines
