import json
"""python tests/escort_test.py — 接客還債（RP5：開班門檻、只有老婆、上限、付款帳本、收工結算）。"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import escort as ES  # noqa: E402
import life_agent as la  # noqa: E402
from life_agent_test import NOW, Seq, girl, save  # noqa: E402

H = 3600 * 1000


def wife_save(gold, stage="wife", archetype="文靜溫柔", taken=None, present=False):
    g = girl()
    g["roomStage"] = stage
    g["stage"] = stage
    g["archetype"] = archetype
    g["stats"] = {"loyalty": 80}
    data = save([g], present=present, until=NOW + 5 * H if present else 0)
    data["gold"] = gold
    if taken is not None:
        data["escortTaken"] = taken
    return data


def store_for(data):
    store = la.new_store()
    la.absorb(store, data, NOW, Seq(0.3))
    return store


def threshold_tests():
    # 50 不去、51 去
    for gold, go in ((-50, False), (-51, True), (0, False), (20, False)):
        data = wife_save(gold)
        store = store_for(data)
        started = la.auto_escort(store, data, NOW, Seq(0.0))
        assert bool(started) == go, (gold, started)
    # 不是老婆不去
    for st in ("lover", "girlfriend", "stranger"):
        data = wife_save(-200, stage=st)
        store = store_for(data)
        assert la.auto_escort(store, data, NOW, Seq(0.0)) is None, st
    # 人在房裡：RP5 不動（手機帶出門）
    data = wife_save(-200, present=True)
    store = store_for(data)
    assert store["girls"]["a"]["phase"] == "room"
    assert la.auto_escort(store, data, NOW, Seq(0.0)) is None


def plan_tests():
    rec = {"libido": "SSR", "fuckedSeen": 60}
    p = ES.plan_shift(rec, 10_000, NOW, Seq(0.99), 4)
    assert p["clients"] == 4 and all(ES.PAY_MIN <= x <= ES.PAY_MAX for x in p["pays"]), p
    assert ES.SHIFT_MIN_MS <= p["ms"] <= ES.SHIFT_MAX_MS
    # 錢夠還清就收工：欠 20，第一位就付 ≥15……第二位補到
    p = ES.plan_shift({"libido": "N"}, 20, NOW, Seq(0.0), 4)
    assert p["paid"] >= 20 and p["clients"] == 2 and p["ms"] >= H, p
    assert ES.client_pay("N", 0, 0.0) == 15 and ES.client_pay("SSR", 999, 0.999) == 40


def ledger_tests():
    data = wife_save(-120)
    store = store_for(data)
    rec = store["girls"]["a"]
    la.start_escort(rec, 120, NOW, Seq(0.0), clients=2)
    assert rec["agenda"]["kind"] == "escort"
    until = rec["agenda"]["until"]
    la.quick_step(store, until + 1000, Seq(0.5))
    paid = rec["escortPaid"]
    assert paid == 34 and rec["agenda"]["kind"] == "idle", (paid, rec["agenda"])
    # 手機還沒收：估負債扣掉；收了以後（escortTaken）不重複扣
    assert ES.est_debt(data, store) == 86
    data["gold"] = -86
    data["escortTaken"] = {"a": paid}
    assert ES.est_debt(data, store) == 86
    # 再結算一次同一班不會再加錢
    assert la.settle(store, "a", until, "", until + 2000) is False
    assert rec["escortPaid"] == paid
    # 痕跡、忠誠、飢渴、記憶（私密）、客人
    v = la.view_of(rec)
    assert v["escort"]["lastSeq"] == 1 and v["escort"]["lastClients"] == 2 and v["escort"]["paid"] == 34
    assert v["loyaltyLoss"] == 2 and v["traces"][-1]["kind"] == "escort"
    assert v["memories"][-1]["private"] == "escort"
    assert sum(1 for m in v["met"] if m["role"] == "客人") == 2
    assert v["lastAffair"] is None   # 接客不算偷吃


def limit_tests():
    data = wife_save(-500)
    store = store_for(data)
    rec = store["girls"]["a"]
    assert la.auto_escort(store, data, NOW, Seq(0.0))
    la.quick_step(store, rec["agenda"]["until"] + 1, Seq(0.5))
    end = rec["escortLastEnd"]
    # 休息不到 4 小時不開
    assert la.auto_escort(store, data, end + 3 * H, Seq(0.0)) is None
    rec["agenda"] = None
    la.quick_step(store, end + 3 * H, Seq(0.5))
    rec["agenda"] = {"kind": "idle", "until": end + 5 * H, "startedAt": end + 4 * H}
    assert la.auto_escort(store, data, end + 4 * H + 1, Seq(0.0))
    la.quick_step(store, rec["agenda"]["until"] + 1, Seq(0.5))
    # 24 小時內第三班不開
    rec["agenda"] = {"kind": "idle", "until": NOW + 23 * H, "startedAt": NOW + 22 * H}
    assert la.auto_escort(store, data, NOW + 22 * H + 1, Seq(0.0)) is None
    # 睡覺時不打斷
    rec["escortStarts"] = []
    rec["escortLastEnd"] = 0
    rec["agenda"] = {"kind": "sleep", "until": NOW + 30 * H, "startedAt": NOW + 25 * H}
    assert la.auto_escort(store, data, NOW + 26 * H, Seq(0.0)) is None


def flag_tests():
    # 手機帶她出門：world.escortGo 同一個 key 只開一班
    data = wife_save(-80)
    data["succubi"][0]["world"]["escortGo"] = {"key": "k1", "at": NOW, "debt": 80}
    store = store_for(data)
    rec = store["girls"]["a"]
    assert rec["agenda"]["kind"] == "escort"
    la.quick_step(store, rec["agenda"]["until"] + 1, Seq(0.5))
    la.absorb(store, data, rec["escortLastEnd"] + 5 * H, Seq(0.3))
    assert rec["agenda"]["kind"] != "escort" and rec["escortSeq"] == 1


def pick_tests():
    store = {"girls": {
        "a": {"stage": "wife", "phase": "japan", "loyaltySeen": 90},
        "b": {"stage": "obedient_wife", "phase": "japan", "loyaltySeen": 40},
        "c": {"stage": "lover", "phase": "japan"}}}
    assert ES.pick_wife(store) is store["girls"]["b"]


def mirror_tests():
    js = (Path(__file__).resolve().parents[1] / "web/content/escort.js").read_text(encoding="utf8")
    for name in ("AUTO_DEBT", "PAY_MIN", "PAY_MAX", "CLIENTS_MIN", "CLIENTS_MAX", "SHIFTS_PER_DAY"):
        assert re.search(rf"export const {name} = {getattr(ES, name)};", js), name
    assert "SHIFT_MIN_MS = 2 * 3600e3" in js and "REST_MS = 4 * 3600e3" in js
    for k, v in ES.LIBIDO_PAY.items():
        assert f"{k}: {v}" in js, k


if __name__ == "__main__":
    threshold_tests()
    plan_tests()
    ledger_tests()
    limit_tests()
    flag_tests()
    pick_tests()
    mirror_tests()
    assert [ES.client_build(i) for i in ["c12345", "c999001", "客人A", "s3-2"]] == ["average", "muscular", "fat", "muscular"]
    assert len({ES.client_build(f"c{i}") for i in range(200)}) == len(ES.CLIENT_BUILDS)
    assert [ES.client_pose(f"c{i}", 3, i % 3) for i in range(8)] == json.loads('[{"pose": "kiss", "pose2": "", "switchAt": 0.0}, {"pose": "reverse", "pose2": "", "switchAt": 0.0}, {"pose": "doggy", "pose2": "", "switchAt": 0.0}, {"pose": "missionary", "pose2": "reverse", "switchAt": 0.58}, {"pose": "reverse", "pose2": "", "switchAt": 0.0}, {"pose": "doggy", "pose2": "", "switchAt": 0.0}, {"pose": "missionary", "pose2": "", "switchAt": 0.0}, {"pose": "cowgirl", "pose2": "", "switchAt": 0.0}]')
    import escort_lines as EL
    sysm, user = EL.prompt({"pose": "doggy", "build": "fat", "voice": "beggy", "stage": "wife", "family": "溫柔", "name": "田中", "regular": True})
    assert "老漢推車" in user and "大肚子" in user and "常客田中" in user and "未成年" in sysm
    good = "客：夾得好緊\n她：慢一點…\n客：再來\n她：嗯…好深…\n客：叫大聲點\n她：會壞掉的…\n她：救命\n客：" + "長" * 30
    ls = EL.parse(good)
    assert len(ls) == 6 and ls[0] == {"side": "client", "text": "夾得好緊"} and all("救命" not in l["text"] for l in ls)
    assert EL.parse("客：一句\n她：一句") == []
    print("escort ok")
