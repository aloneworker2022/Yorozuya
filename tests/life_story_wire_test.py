"""python tests/life_story_wire_test.py — 故事卡接進日本溜達（life_agent.roll_event／prompt／settle）"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import life_agent as la  # noqa: E402

NOW = 1791100000000


def girl(arch="好奇", libido="R"):
    rec = la._blank("g1")
    rec.update({"name": "小夜", "phase": "japan", "regionId": "kanto", "groundId": "asakusa", "homeName": "書店樓上的房間",
                "archetype": arch, "libido": libido})
    return rec


def main():
    decks = {}
    rec = girl()
    for seed in range(400):
        ev = la.roll_event(rec, "stroll", NOW + seed * la.HOUR_MS, random.Random(seed).random)
        st = ev.get("story")
        if not st:
            continue
        decks[st["deck"]] = decks.get(st["deck"], 0) + 1
        assert ev["actId"] == "story" and ev["act"] == st["lines"][0]
        assert len(st["lines"]) == len(st["ids"]) == 4
        assert not ev.get("scp") and not ev.get("ero") and not ev.get("person")
        assert ev["outcome"]["mood"] in ("不安", "臉紅心跳", "愉快")
        # 能存成 JSON（agenda.event 會落地）
        import json
        json.dumps(ev, ensure_ascii=False)
    assert sum(decks.values()) > 60, decks
    assert {"first", "daily", "horror"} <= set(decks), decks

    # 提示詞照骨架走、不會說出卡片
    ev = next(la.roll_event(girl(), "stroll", NOW, random.Random(s).random) for s in range(200)
              if la.roll_event(girl(), "stroll", NOW, random.Random(s).random).get("story"))
    lines = la.story_lines_for(ev["story"])
    assert lines[1].startswith("起：") and lines[4].startswith("合：")

    # settle：寫進永久人生經歷、記住抽過的牌
    rec = girl()
    for seed in range(200):
        ev = la.roll_event(rec, "stroll", NOW, random.Random(seed).random)
        if ev.get("story"):
            break
    rec["agenda"] = {"kind": "stroll", "until": NOW, "startedAt": NOW - la.HOUR_MS, "event": ev}
    store = {"girls": {"g1": rec}}
    assert la.settle(store, "g1", NOW, "我在淺草溜達，學到一件事。", NOW, random.Random(1).random)
    assert rec["lifeStory"] and rec["lifeStory"][-1]["text"] == ev["story"]["learn"]["text"]
    assert set(ev["story"]["ids"]) <= set(rec["storySeen"])
    assert la.fallback_text({"event": ev})

    # 色情故事：私事、會過禁字
    rec = girl("好奇", "SSR")
    ev = None
    for seed in range(3000):
        e = la.roll_event(rec, "stroll", NOW, random.Random(seed).random)
        if (e.get("story") or {}).get("deck") == "erotic":
            ev = e
            break
    assert ev, "SSR 應該抽得到色情故事"
    assert la.ERO_RULE in la.story_lines_for(ev["story"])
    assert la.accept_text({"event": ev}, "我在公園看到一隻狗跟著他們。") == ""
    print("ok", decks)


main()
