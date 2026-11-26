"""python tests/roommate_test.py — 室友（住在召喚者房間、自己出門過生活，2026-11-25 使用者，PLAN §13.0 第 7 項）"""
import random
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import life_agent as la  # noqa: E402

H = la.HOUR_MS
NOON = int(datetime(2026, 11, 25, 13, 0, tzinfo=ZoneInfo("Asia/Tokyo")).timestamp() * 1000)


def save(present=True, roommate=True, recall=0, world=None, stage="girlfriend", pro=50):
    g = {"id": "a", "name": "小夜", "stage": stage, "stats": {"proactivity": pro}, "world": world or {}}
    mg = dict(g, roommate=roommate, roomVisitUntil=0)
    if recall:
        mg["recallAt"] = recall
    return {"succubi": [g], "roomMirror": {"present": present, "girlId": "a", "girl": mg}}


def main():
    rnd = random.Random(3).random
    store = la.new_store()

    # 新室友：住在房間，排好下一次出門（3～6 小時 × 關係 × 主動度）、旅遊 7～14 天後
    la.absorb(store, save(), NOON, rnd)
    rec = store["girls"]["a"]
    assert rec["roommate"] and rec["phase"] == "room", rec.get("phase")
    gap = rec["nextOutAt"] - NOON
    assert 3 * H <= gap <= 6 * H, gap / H
    assert 7 * 24 * H <= rec["nextTravelAt"] - NOON <= 14 * 24 * H
    # 手機鏡像說她不在房裡也不會被帶回日本（位置由 RP5 決定）
    la.absorb(store, save(present=False), NOON + 60_000, rnd)
    assert rec["phase"] == "room"
    la.quick_step(store, NOON + 60_000, rnd)
    assert rec["phase"] == "room", "還沒到點不出門"

    # 到點：出門（打工或溜達），phase japan＝外出中
    t = rec["nextOutAt"] + 1
    la.quick_step(store, t, rnd)
    assert rec["phase"] == "japan" and rec["agenda"]["kind"] in ("work", "stroll"), rec.get("agenda")
    until = rec["agenda"]["until"]
    # 結束（不用模型的保底文字）：寫記憶、回房間、排下一次
    assert la.settle(store, "a", until, "", until + 1, rnd)
    assert rec["phase"] == "room" and rec["agenda"] is None
    assert rec["nextOutAt"] > until and (rec.get("memories") or [])

    # 旅遊到點：去旅遊（12～24 小時），旅遊地進 agenda.dest
    rec["nextOutAt"] = NOON + 1
    rec["nextTravelAt"] = NOON
    la.quick_step(store, NOON + 2, rnd)
    ag = rec["agenda"]
    assert rec["phase"] == "japan" and ag["kind"] == "travel" and ag["dest"] in la.TRAVEL_SPOTS, ag
    assert 12 * H <= ag["until"] - NOON <= 24 * H + 10
    assert rec["nextTravelAt"] > ag["until"]
    ev = la.roll_event(rec, "travel", ag["until"], rnd)
    assert ev["kind"] == "travel" and ev["travel"] == ag["dest"] and ev["place"].startswith(ag["dest"])
    assert la.needs_llm(ev)
    sys_p, user_p = la.event_prompt(dict(la.prepare_resolve(store, "a", ag["until"] + 1, rnd), event=ev))
    assert "旅遊" in user_p and "住在召喚者的房間" in user_p, user_p
    view = la.view_of(rec)
    assert view["roommate"] and view["activity"] == "travel" and view["travel"] == ag["dest"]

    # 付錢叫回來：鏡像寫新的 recallAt → 外出到一半回房間，記一筆
    la.absorb(store, save(recall=NOON + 5000), NOON + 5000, rnd)
    assert rec["phase"] == "room" and "叫回" in rec["note"]
    # 同一個 recallAt 不會再觸發
    rec["phase"] = "japan"
    la.absorb(store, save(recall=NOON + 5000), NOON + 6000, rnd)
    assert rec["phase"] == "japan"
    la.to_room(rec, NOON + 6000, rnd)

    # 睡覺時間不出門：延到醒來後
    night = int(datetime(2026, 11, 26, 3, 0, tzinfo=ZoneInfo("Asia/Tokyo")).timestamp() * 1000)
    rec["nextOutAt"] = night - 1
    rec["nextTravelAt"] = night + 30 * 24 * H
    la.quick_step(store, night, rnd)
    assert rec["phase"] == "room" and rec["nextOutAt"] > night

    # 關係越黏越少出門：病態妻子的間隔比陌生人長
    a = {"stage": "stranger", "proactivity": 50}
    b = {"stage": "pathological_wife", "proactivity": 50}
    r1, r2 = random.Random(1).random, random.Random(1).random
    assert la.roommate_gap_ms(b, r2) > la.roommate_gap_ms(a, r1) * 2
    # 主動度高的比較常出門
    assert la.roommate_gap_ms({"stage": "friend", "proactivity": 90}, random.Random(2).random) < la.roommate_gap_ms({"stage": "friend", "proactivity": 10}, random.Random(2).random)

    # 舊存檔：住在日本（有住所、在家發呆）的那位變成室友 → 搬回房間
    store2 = la.new_store()
    world = {"home": {"id": "market-flat", "name": "超市樓上的一房"}, "regionId": "kanto"}
    la.absorb(store2, save(present=False, roommate=False, world=world), NOON, rnd)
    r = store2["girls"]["a"]
    assert r["phase"] == "japan" and not r.get("roommate")
    r["agenda"] = {"kind": "idle", "until": NOON + H, "startedAt": NOON}
    la.absorb(store2, save(present=False, roommate=True, world=world), NOON + 10, rnd)
    assert r["roommate"] and r["phase"] == "room", r["phase"]

    # 換室友：原本那位（不再是鏡像的那位）照舊回日本住所過日子
    data = save(present=True, roommate=True)
    data["succubi"].append({"id": "b", "name": "莉莉", "world": {}})
    data["roomMirror"] = {"present": True, "girlId": "b", "girl": {"id": "b", "roommate": True}}
    la.absorb(store, data, NOON + 20, rnd)
    assert not store["girls"]["a"]["roommate"] and store["girls"]["a"]["phase"] == "japan" and store["girls"]["a"].get("homeId")
    assert store["girls"]["b"]["roommate"] and store["girls"]["b"]["phase"] == "room"
    # 2026-11-26 請她回日本：同一位、鏡像的 roommate 旗拿掉、人不在房間 → 不再是室友，回日本住
    store3 = la.new_store()
    la.absorb(store3, save(), NOON, rnd)
    r3 = store3["girls"]["a"]
    assert r3["roommate"] and r3["phase"] == "room"
    la.absorb(store3, save(present=False, roommate=False), NOON + 1000, rnd)
    assert not r3["roommate"] and r3["phase"] == "japan", (r3.get("roommate"), r3.get("phase"))
    print("ok - roommate")


if __name__ == "__main__":
    main()
