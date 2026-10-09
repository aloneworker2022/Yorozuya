"""python tests/friend_line_test.py — 交友線（見過→認識→朋友→曖昧→肉體→炮友）＋光著身子離房。"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import life_agent as la  # noqa: E402
import life_friends as LF  # noqa: E402
from life_agent_test import NOW, Seq, girl, save, japan_rec  # noqa: E402

CTX = {"stage": "stranger", "loyalty": 60, "hunger": 50, "mood": "平靜", "archetype": "文靜溫柔"}


def row(stage, role="同事", intent="court", **kw):
    r = {"id": "p1", "name": "佐藤健", "gender": "male", "role": role, "where": "咖啡店", "named": stage != "seen",
         "stage": stage, "intent": intent, "count": 3, "lastAt": NOW - 3600e3}
    r.update(kw)
    return r


def progression_tests():
    # 同事 > 顧客 > 路人
    c = [LF.step_chance(row("known", role=r), CTX) for r in ("同事", "顧客", "路人")]
    assert c[0] > c[1] > c[2] > 0, c
    # 一次最多一步
    st = LF.advance(row("known"), CTX, NOW, Seq(0.0))
    assert st["from"] == "known" and st["to"] == "friend" and not st["sex"], st
    st = LF.advance(row("flirt"), CTX, NOW, Seq(0.0))
    assert st["to"] == "physical" and st["sex"], st
    # 見過：叫得出名字的互動直接認識
    assert LF.advance(row("seen"), CTX, NOW, Seq(0.99), know=True)["to"] == "known"
    # 單純友善最多到朋友
    assert LF.step_chance(row("friend", intent="friendly"), CTX) == 0
    # 肉體要做過 3 次才可能變炮友
    assert LF.step_chance(row("physical", sexCount=2), CTX) == 0
    assert LF.step_chance(row("physical", sexCount=3), CTX) > 0
    # 炮友是頂
    assert LF.step_chance(row("fwb"), CTX) == 0
    # 意圖：權重 40/30/20/10
    seen = {LF.pick_intent(Seq(x)) for x in (0.0, 0.45, 0.75, 0.95)}
    assert seen == {"friendly", "court", "lust", "danger"}, seen


def regress_tests():
    old = NOW - 20 * 24 * 3600e3
    st = LF.advance(row("friend", lastAt=old), CTX, NOW, Seq(0.0))
    assert st["to"] == "known" and st["regress"], st
    st = LF.advance(row("friend"), CTX, NOW, Seq(0.0), act_id="argue")
    assert st["to"] == "known" and st["regress"], st
    for s in ("flirt", "physical", "fwb"):
        st = LF.advance(row(s, lastAt=old), CTX, NOW, Seq(0.0), act_id="argue")
        assert LF.rank(st["to"]) >= LF.rank(s), (s, st)
    r = row("physical")
    LF.apply_step(r, {"from": "physical", "to": "known"}, NOW, Seq(0.5))
    assert r["stage"] == "physical"


def gating_tests():
    def cm(stage, loyalty, hunger=50):
        return LF.cross_mult(stage, loyalty, hunger, "平靜", "文靜溫柔")
    stranger, friend, gf, wife = cm("stranger", 60), cm("friend", 60), cm("girlfriend", 60), cm("wife", 90)
    assert stranger > friend > gf > wife, (stranger, friend, gf, wife)
    assert gf < stranger * 0.3
    assert wife < stranger * 0.02  # 妻子＋高忠誠幾乎不會
    assert cm("girlfriend", 90) < cm("girlfriend", 30)
    # 飢渴強烈拉高：100 是 0 的 5 倍
    assert abs(LF.hunger_mult(100) / LF.hunger_mult(0) - 5) < 1e-9
    assert cm("stranger", 60, 100) > cm("stranger", 60, 20) * 3
    # 心情、個性只動一點
    assert LF.cross_mult("stranger", 60, 50, "臉紅心跳", "清純反差") > LF.cross_mult("stranger", 60, 50, "不安", "高冷")


def naked_tests():
    for r in (0.0, 0.3, 0.6, 0.999):
        n = LF.naked_count(50, "R", Seq(r))
        assert 1 <= n <= 15, n
    import random
    rnd = random.Random(1)
    lo = sum(LF.naked_count(10, "N", rnd.random) for _ in range(3000)) / 3000
    hi = sum(LF.naked_count(100, "SSR", rnd.random) for _ in range(3000)) / 3000
    assert hi > lo * 2, (lo, hi)
    # 沒有認識的人 → 一定陌生人
    assert LF.naked_pick([row("seen")], Seq(0.99)) is None
    # 有認識的人：60% 陌生人
    known = [row("known"), dict(row("fwb"), id="p2")]
    assert LF.naked_pick(known, Seq(0.5)) is None
    assert LF.naked_pick(known, Seq(0.7, 0.99))["id"] == "p2"  # 炮友權重大
    # 門檻
    assert LF.naked_result(None, 4) == "anon"
    assert LF.naked_result(None, 5) == "physical" and LF.naked_result(None, 10) == "physical"
    assert LF.naked_result(None, 11) == "fwb"
    assert LF.naked_result(row("known"), 2) == "physical"
    assert LF.naked_result(row("friend"), 12) == "physical"
    assert LF.naked_result(row("physical"), 10) == "physical" and LF.naked_result(row("physical"), 11) == "fwb"
    assert LF.naked_result(row("fwb"), 1) == "fwb"
    assert LF.naked_relief(1) == 28 and LF.naked_relief(15) == 100


def naked_flow_tests():
    # 手機在離房時打旗 → RP5 排成一趟，70% 擲中
    store = la.new_store()
    g = girl()
    g["world"]["leftNaked"] = {"key": "v123", "at": NOW}
    la.absorb(store, save([g]), NOW, Seq(0.1, 0.5, 0.5, 0.0))
    rec = store["girls"]["a"]
    ev = (rec.get("agenda") or {}).get("event") or {}
    assert ev.get("naked"), rec.get("agenda")
    assert rec["nakedKeys"] == ["v123"]
    # 同一個 key 不會再來一次
    rec["agenda"] = None
    la.absorb(store, save([g]), NOW + 1000, Seq(0.0))
    assert not (rec.get("agenda") or {}).get("event", {}).get("naked")
    # 30%：直接回家
    store2 = la.new_store()
    g2 = girl()
    g2["world"]["leftNaked"] = {"key": "v9", "at": NOW}
    la.absorb(store2, save([g2]), NOW, Seq(0.8))
    assert not ((store2["girls"]["a"].get("agenda") or {}).get("event") or {}).get("naked")
    # 停留到期、手機關著：RP5 看房間鏡像還是全裸
    store3 = la.new_store()
    g3 = girl()
    s3 = save([g3], present=True, until=NOW + 1000)
    la.absorb(store3, s3, NOW, Seq(0.5))
    s3["roomMirror"]["girl"]["undress"] = {"stage": 3}
    la.absorb(store3, s3, NOW + 5000, Seq(0.1, 0.5, 0.5, 0.0))
    r3 = store3["girls"]["a"]
    assert ((r3.get("agenda") or {}).get("event") or {}).get("naked"), r3.get("agenda")
    # 脫一半不算
    store4 = la.new_store()
    s4 = save([girl()], present=True, until=NOW + 1000)
    la.absorb(store4, s4, NOW, Seq(0.5))
    s4["roomMirror"]["girl"]["undress"] = {"stage": 2}
    la.absorb(store4, s4, NOW + 5000, Seq(0.0))
    assert not ((store4["girls"]["a"].get("agenda") or {}).get("event") or {}).get("naked")

    # 結算：陌生人 7 次 → 新的肉體關係；飢渴大降、忠誠掉、留痕跡
    store5, rec5 = japan_rec(at=NOW)
    rec5["stage"], rec5["loyaltySeen"] = "girlfriend", 70
    ev = la.start_naked(rec5, "k1", NOW, Seq(0.5), force=True, count=7)
    assert ev["naked"]["result"] == "physical" and not ev["naked"]["known"]
    assert ev["outcome"]["mood"] == "心虛"
    until = rec5["agenda"]["until"]
    assert la.settle(store5, "a", until, "", until + 1, Seq(0.5))
    m = rec5["met"][-1]
    assert m["stage"] == "physical" and m["sexCount"] == 7 and m["named"]
    assert rec5["hungerRelief"] == LF.naked_relief(7) and rec5["loyaltyLoss"] == LF.naked_loyalty(7)
    assert rec5["traces"][-1]["rounds"] == 7 and rec5["lastAffair"]["kind"] == "naked"
    assert rec5["memories"][-1].get("private") == "affair"
    # 陌生人 3 次 → 不認識、不進名單
    store6, rec6 = japan_rec(at=NOW)
    la.start_naked(rec6, "k2", NOW, Seq(0.5), force=True, count=3)
    u = rec6["agenda"]["until"]
    la.settle(store6, "a", u, "", u + 1, Seq(0.5))
    assert rec6["met"] == [] and rec6["anonSex"] == 1 and rec6["traces"]
    # 很多次 → 虛脫
    store7, rec7 = japan_rec(at=NOW)
    assert la.start_naked(rec7, "k3", NOW, Seq(0.5), force=True, count=12)["outcome"]["mood"] == "虛脫"


def bond_flow_tests():
    store, rec = japan_rec(at=NOW)
    rec["met"] = [row("flirt", role="同事", where="咖啡店")]
    rec["stage"], rec["loyaltySeen"] = "stranger", 50
    ev = la.force_meet(rec, "p1", NOW, Seq(0.0))
    assert ev["bond"]["to"] == "physical" and ev["bond"]["sex"]
    # 一定要寫成她自願／半推半就
    action = la.prepare_resolve(store, "a", NOW + 10_000)
    _sys, prompt = la.event_prompt(action)
    assert "半推半就" in prompt and "沒有強迫" in prompt, prompt
    assert la.accept_text(action, "我被他強迫了，對方一直壓著我。") == ""
    assert la.accept_text(action, "我跟佐藤健待到很晚，他問要不要去他那裡，我點了頭。") != ""
    fb = la.fallback_text(action)
    assert "佐藤健" in fb and "點頭" in fb
    until = rec["agenda"]["until"]
    la.settle(store, "a", until, "", NOW + 20_000, Seq(0.5))
    assert rec["met"][0]["stage"] == "physical" and rec["met"][0]["sexCount"] == 1
    assert rec["hungerRelief"] == LF.SEX_HUNGER_RELIEF and rec["loyaltyLoss"] == LF.LOYALTY_PER_SEX
    # 危險人物：強勢但還是她點頭
    lines = LF.bond_lines({"from": "flirt", "to": "physical", "sex": True}, "他", "danger", "dating")
    assert LF.DANGER_RULE in lines and LF.GUILT_RULE in lines and LF.CONSENT_RULE in lines
    # 朋友回退寫得出來
    assert "退回" in LF.bond_lines({"from": "friend", "to": "known", "regress": True}, "他", "court", "reserved")[0]
    # 首次碰到叫得出名字 → 認識＋意圖
    store2, rec2 = japan_rec(at=NOW)
    ev2 = {"kind": "work", "person": {"id": "x", "name": "a", "revisit": False}}
    la._roll_bond(rec2, ev2, {"id": "contact", "know": True}, NOW, Seq(0.5))
    assert ev2["bond"]["to"] == "known" and ev2["bond"]["intent"] in LF.INTENT_BY_ID


def hunger_sync_tests():
    store, rec = japan_rec(at=NOW)
    rec["libido"], rec["stage"] = "R", "stranger"
    la._take_phone_hunger(rec, {"level": 40, "at": NOW, "lifeTaken": 0})
    assert la.hunger_estimate(rec, NOW) == 40
    assert abs(la.hunger_estimate(rec, NOW + 10 * la.HOUR_MS) - 58) < 1e-6   # R 1.8/h
    la.hunger_shift(rec, -30, NOW)
    assert la.hunger_estimate(rec, NOW) == 10 and rec["hungerRelief"] == 30
    la.hunger_shift(rec, +14, NOW)
    assert la.hunger_estimate(rec, NOW) == 24 and rec["hungerGiven"] == 14
    # 手機收過（lifeReliefTaken=30、lifeTaken=14）且存了更新的值 → 副本換成手機的
    la._take_phone_hunger(rec, {"level": 24, "at": NOW + 1000, "lifeTaken": 14, "lifeReliefTaken": 30})
    assert la.hunger_estimate(rec, NOW + 1000) == 24
    # 手機的舊值（at 比較早）不蓋掉
    la._take_phone_hunger(rec, {"level": 99, "at": NOW - 5000, "lifeTaken": 14, "lifeReliefTaken": 30})
    assert la.hunger_estimate(rec, NOW + 1000) == 24
    # 忠誠估計
    rec["loyaltySeen"], rec["loyaltyLoss"], rec["loyaltyTaken"] = 70, 5, 2
    assert la.loyalty_now(rec) == 67
    # absorb 讀關係階和忠誠
    store2 = la.new_store()
    g = girl()
    g["stage"] = "wife"
    g["stats"] = {"loyalty": 88}
    la.absorb(store2, save([g]), NOW, Seq(0.5))
    r2 = store2["girls"]["a"]
    assert r2["stage"] == "wife" and r2["loyaltySeen"] == 88


def mirror_tests():
    js = (Path(__file__).resolve().parents[1] / "web/content/life_friends.js").read_text()

    def grab(name):
        return re.search(rf"export const {name} = (.+?);", js).group(1)

    assert json.loads(grab("FRIEND_STAGES")) == list(LF.STAGES)
    for table, src in (("FRIEND_STAGE_ZH", LF.STAGE_ZH), ("ROLE_EASE", LF.ROLE_EASE), ("STEP_BASE", LF.STEP_BASE),
                       ("SEX_BASE", LF.SEX_BASE), ("BAND_GATE", LF.BAND_GATE), ("LOYALTY_K", LF.LOYALTY_K)):
        t = grab(table)
        for k, v in src.items():
            val = json.dumps(v, ensure_ascii=False) if isinstance(v, str) else (f"{v:.1f}" if isinstance(v, float) and v == int(v) else str(v))
            assert f"{k}: {val}" in t, (table, k, val, t)
    for k in LF.INTENT_BY_ID:
        assert f"{k}: \"{LF.INTENT_BY_ID[k]['name']}\"" in grab("FRIEND_INTENT_ZH"), k
    for name in ("SEX_HUNGER_RELIEF", "LOYALTY_PER_SEX", "NAKED_CHANCE", "NAKED_MAX", "NAKED_STRANGER", "NAKED_ANON_BELOW", "NAKED_FWB_ABOVE"):
        assert float(grab(name)) == float(getattr(LF, name)), name
    sch = (Path(__file__).resolve().parents[1] / "web/content/life_schedule.js").read_text()
    assert '"心虛"' in re.search(r"export const OUTSIDE_MOODS = (.+?);", sch).group(1)
    # 伺服器的飢渴漲法跟 hunger.js 一樣
    hj = (Path(__file__).resolve().parents[1] / "web/content/hunger.js").read_text()
    for k, v in la.HUNGER_RATE.items():
        assert f"{k}: {v}" in re.search(r"export const HUNGER_RATE = (.+?);", hj).group(1), k
    for k, v in la.HUNGER_STAGE_MULT.items():
        assert f"{k}: {v}" in re.search(r"export const HUNGER_STAGE_MULT = (.+?);", hj).group(1), k


if __name__ == "__main__":
    progression_tests()
    regress_tests()
    gating_tests()
    naked_tests()
    naked_flow_tests()
    bond_flow_tests()
    hunger_sync_tests()
    mirror_tests()
    print("friend line ok")
