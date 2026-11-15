"""python tests/story_cards_test.py — 故事卡抽卡引擎（server/story_cards.py）"""
import random
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import story_cards as sc  # noqa: E402

H = sc.HOUR_MS
NIGHT = int(datetime(2026, 8, 10, 23, 30, tzinfo=ZoneInfo("Asia/Tokyo")).timestamp() * 1000)
D = sc.SAMPLE_DECK
ok = 0


def t(name, fn):
    global ok
    fn()
    ok += 1
    print("ok -", name)


def girl(arch, libido="R"):
    return {"id": arch, "archetype": arch, "libido": libido, "regionId": "kanto"}


def chain_ok(story):
    tags = set()
    for c in story["cards"]:
        assert set(c.get("needs") or []) <= tags, (c["id"], tags)
        tags |= set(c.get("gives") or [])


def test_chain():
    for seed in range(200):
        s = sc.draw_story(girl("普通"), D, "horror", NIGHT, place="sento", rnd=random.Random(seed).random)
        assert s and [c["slot"] for c in s["cards"]] == list(sc.SLOTS)
        assert s["cards"][0]["id"] == "h-s-sento"
        chain_ok(s)


def test_start_filters():
    day = NIGHT - 12 * H
    assert sc.draw_story(girl("普通"), D, "horror", day, place="sento", rnd=random.Random(1).random) is None
    assert sc.draw_story(girl("普通"), D, "horror", NIGHT, place="kitchen", rnd=random.Random(1).random) is None
    assert sc.season_of(NIGHT) == "summer" and sc.time_of(NIGHT) == "night"


def test_personality_diverges():
    def turn_of(arch):
        n = {"h-t-run": 0, "h-t-look": 0}
        for seed in range(400):
            s = sc.draw_story(girl(arch), D, "horror", NIGHT, place="sento", rnd=random.Random(seed).random)
            n[s["cards"][2]["id"]] += 1
        return n
    shy, brave = turn_of("膽小"), turn_of("好奇")
    assert shy["h-t-run"] > 3 * shy["h-t-look"], shy
    assert brave["h-t-look"] > 3 * brave["h-t-run"], brave


def test_no_repeat_and_cooldown():
    rec = girl("普通")
    rnd = random.Random(7).random
    s1 = sc.draw_story(rec, D, "horror", NIGHT, place="sento", rnd=rnd)
    item = sc.commit_story(rec, s1)
    assert item["text"] and rec["lifeStory"][-1] is item
    # 同一張起牌冷卻中
    assert sc.draw_story(rec, D, "horror", NIGHT + 24 * H, place="sento", rnd=rnd) is None
    later = NIGHT + sc.STORY_START_COOL_MS + H
    combos = set(rec["storyCombos"])
    for i in range(20):
        s = sc.draw_story(rec, D, "horror", later + i * sc.STORY_START_COOL_MS, place="sento", rnd=rnd)
        if s is None:
            break
        assert sc._combo_key(s["cards"]) not in combos
        combos.add(sc._combo_key(s["cards"]))
        sc.commit_story(rec, s)


def test_two_girls_differ():
    a, b = girl("普通"), girl("普通")
    ra, rb = random.Random(1).random, random.Random(2).random
    sa = [sc._combo_key(sc.draw_story(a, D, "horror", NIGHT, place="sento", rnd=ra)["cards"]) for _ in range(30)]
    sb = [sc._combo_key(sc.draw_story(b, D, "horror", NIGHT, place="sento", rnd=rb)["cards"]) for _ in range(30)]
    assert len(set(sa) | set(sb)) >= 3


def test_heat_follows_libido():
    def watched(lib):
        n = 0
        for seed in range(400):
            s = sc.draw_story(girl("普通", lib), D, "erotic", NIGHT, place="park", rnd=random.Random(seed).random)
            n += s["cards"][2]["id"] == "e-t-watch"
        return n
    assert watched("SSR") > watched("N")


def test_erotic_private_and_brief():
    rec = girl("普通")
    s = sc.draw_story(rec, D, "erotic", NIGHT, place="park", rnd=random.Random(3).random)
    item = sc.commit_story(rec, s)
    assert item["private"] is True
    brief = sc.story_brief(s, "小夜")
    assert "旁觀者" in brief and "起：" in brief and "合：" in brief


def test_ban():
    for bad in ("她看到一隻狗和", "有人在跟動物", "穿制服的", "被強暴"):
        try:
            sc.validate_card({"id": "x", "deck": "erotic", "slot": "承", "text": bad})
        except sc.CardError:
            continue
        raise AssertionError(bad)
    try:
        sc.validate_card({"id": "x", "deck": "daily", "slot": "合", "text": "回家"})
        raise AssertionError("合牌沒有 learn 要擋")
    except sc.CardError:
        pass


def test_life_story_permanent():
    rec = girl("普通")
    base = {"deck": "first", "ctx": {"place": "", "season": "summer"}}
    first = {"id": "f", "slot": "合", "learn": {"kind": "first", "text": "第一次"}}
    daily = {"id": "d", "slot": "合", "learn": {"kind": "lesson", "text": "日常"}}
    sc.commit_story(rec, dict(base, cards=[first], at=1))
    for i in range(sc.LIFE_STORY_CAP + 5):
        sc.commit_story(rec, dict(base, deck="daily", cards=[daily], at=2 + i))
    assert len(rec["lifeStory"]) == sc.LIFE_STORY_CAP
    assert rec["lifeStory"][0]["kind"] == "first"
    assert rec["lifeStoryFolded"] == 6


for name, fn in list(globals().items()):
    if name.startswith("test_"):
        t(name[5:], fn)
print(f"{ok} passed")
