"""python tests/life_agent_test.py"""
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import life_agent as la  # noqa: E402

NOW = 1791100000000


def girl(gid="a", home=True, job=""):
    world = {}
    if home:
        world["home"] = {"id": "market-flat", "name": "超市樓上的一房"}
        world["regionId"] = "kanto"
    if job:
        world["job"] = {"id": "cafe", "name": job}
    return {"id": gid, "name": "小夜", "hobbies": [{"name": "天文"}], "world": world}


def save(girls, present=False, until=0, gid="a"):
    mirror_girl = {"id": gid, "roomVisitUntil": until, "world": girls[0]["world"]}
    return {
        "succubi": girls,
        "roomMirror": {
            "present": present,
            "girlId": gid,
            "girl": mirror_girl,
        },
    }


def main():
    noon = datetime(2026, 10, 6, 15, 0, tzinfo=ZoneInfo("Asia/Tokyo"))
    night = datetime(2026, 10, 6, 23, 30, tzinfo=ZoneInfo("Asia/Tokyo"))
    morning = datetime(2026, 10, 6, 8, 15, tzinfo=ZoneInfo("Asia/Tokyo"))
    noon_info = la.japan_clock(int(noon.timestamp() * 1000))
    assert noon_info["dayPart"] == "白天"
    assert noon_info["season"] == "秋"
    assert "2026年10月6日" in noon_info["line"]
    assert "15:00" in noon_info["line"]
    assert "不要把白天寫成別的時段" in noon_info["line"]
    assert la.japan_clock(int(night.timestamp() * 1000))["dayPart"] == "深夜"
    assert la.japan_clock(int(morning.timestamp() * 1000))["dayPart"] == "早晨"

    assert la.duration_ms("work", lambda: 0.9) == la.WORK_MS
    assert la.duration_ms("browse", lambda: 0.9) == la.BROWSE_MS
    assert la.duration_ms("stroll", lambda: 0.1) == la.STROLL_SHORT_MS
    assert la.duration_ms("stroll", lambda: 0.9) == la.HOUR_MS
    assert la.parse_choice("我想上網看新聞") == "browse"
    assert la.parse_choice("去溜達") == "stroll"
    assert la.parse_choice("打工") == "work"
    assert la.parse_choice("嗯") == ""
    assert la.clip_keyword("「天気」就這個") == "天気"

    store = la.new_store()
    la.absorb(store, save([girl()]), NOW, lambda: 0)
    rec = store["girls"]["a"]
    assert rec["phase"] == "japan"
    assert rec["agenda"] is None
    assert rec["homeName"] == "超市樓上的一房"
    assert rec["notedHome"] is True
    assert any("住所" in m["text"] for m in rec["memories"])

    la.arm(rec, "stroll", NOW, lambda: 0.9)
    la.absorb(store, save([girl()]), NOW + 1000, lambda: 0)
    assert store["girls"]["a"]["agenda"]["kind"] == "stroll"

    store = la.new_store()
    la.absorb(store, save([girl()], present=True, until=NOW + la.HOUR_MS), NOW, lambda: 0)
    assert store["girls"]["a"]["phase"] == "room"
    assert store["girls"]["a"]["agenda"] is None

    store = la.new_store()
    la.absorb(store, save([girl()], present=True, until=0), NOW, lambda: 0)
    assert store["girls"]["a"]["phase"] == "room"
    la.absorb(store, save([girl()], present=False, until=0), NOW, lambda: 0)
    assert store["girls"]["a"]["phase"] == "japan"
    la.absorb(store, save([girl()], present=True, until=0), NOW + 1000, lambda: 0)
    assert store["girls"]["a"]["phase"] == "japan"

    la.absorb(store, save([girl()], present=True, until=NOW - 1000), NOW, lambda: 0)
    assert store["girls"]["a"]["phase"] == "japan"
    assert store["girls"]["a"]["agenda"] is None

    store = la.new_store()
    la.absorb(store, save([girl(home=False)], present=True, until=NOW - 5000), NOW, lambda: 0)
    assert store["girls"]["a"]["phase"] == "japan"
    assert store["girls"]["a"]["homeId"]
    assert store["girls"]["a"]["agenda"] is None

    store = la.new_store()
    data = save([girl()])
    data["succubi"][0]["world"]["agenda"] = {"kind": "work", "until": NOW + la.WORK_MS}
    la.absorb(store, data, NOW, lambda: 0)
    la.overlay(data, store, NOW)
    assert data["succubi"][0]["world"]["agenda"] is None
    assert data["roomMirror"]["present"] is False

    store = la.new_store()
    la.absorb(store, save([girl(), girl("b")]), NOW, lambda: 0)
    plan = la.plan_tick(store, NOW)
    assert len(plan) == 1
    assert plan[0]["op"] == "choose"
    assert "日本時間" in plan[0]["clock"]
    assert "不要把" in plan[0]["clock"]
    assert la.apply_choice(store, plan[0]["id"], "work", NOW, lambda: 0.2)
    armed = store["girls"][plan[0]["id"]]["agenda"]
    assert armed["kind"] == "work"
    assert armed["until"] == NOW + la.WORK_MS
    assert la.plan_tick(store, NOW + 1000)[0]["id"] != plan[0]["id"] or la.plan_tick(store, NOW + 1000)[0]["op"] == "choose"

    other = [g for g in store["girls"] if g != plan[0]["id"]][0]
    assert la.needs_choice(store["girls"][other])
    assert not la.is_due(store["girls"][plan[0]["id"]], NOW + la.HOUR_MS)
    assert la.is_due(store["girls"][plan[0]["id"]], NOW + la.WORK_MS)
    assert la.apply_resolve(store, plan[0]["id"], armed["until"], "我做完這班。", "work", NOW + la.WORK_MS, "browse", lambda: 0.1)
    nxt = store["girls"][plan[0]["id"]]["agenda"]
    assert nxt["kind"] == "browse"
    assert nxt["until"] == NOW + la.WORK_MS + la.BROWSE_MS
    assert not la.apply_resolve(store, plan[0]["id"], armed["until"], "再寫一次", "work", NOW + la.WORK_MS, "work", lambda: 0)

    print("ok - life agent")


if __name__ == "__main__":
    main()
