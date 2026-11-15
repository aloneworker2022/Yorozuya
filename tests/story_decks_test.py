"""python tests/story_decks_test.py — 正式故事牌組（server/story_decks.py）接得起來、真的抽得到"""
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import story_cards as sc  # noqa: E402
import story_decks as sd  # noqa: E402

DECK = sd.DECK
REGIONS = set(sd.GROUND_REGION.values())

# 每個地區都有在地起牌
assert REGIONS <= {r for c in DECK if c["slot"] == "起" and c["deck"] == "daily" for r in c.get("region") or []}

# 每張起牌、每條承→轉都接得到合
for start in [c for c in DECK if c["slot"] == "起"]:
    pool = [c for c in DECK if c["deck"] == start["deck"]]
    tags = set(start.get("gives") or [])
    shos = [c for c in pool if c["slot"] == "承" and set(c.get("needs") or []) <= tags]
    assert shos, f"{start['id']} 沒有承"
    for sho in shos:
        t1 = tags | set(sho.get("gives") or [])
        tens = [c for c in pool if c["slot"] == "轉" and set(c.get("needs") or []) <= t1]
        assert tens, f"{start['id']}／{sho['id']} 沒有轉"
        for ten in tens:
            t2 = t1 | set(ten.get("gives") or [])
            ends = [c for c in pool if c["slot"] == "合" and set(c.get("needs") or []) <= t2]
            assert ends, f"{start['id']}／{sho['id']}／{ten['id']} 沒有合"

# 引擎真的抽得到四種牌堆
NOW = 1791100000000  # 日本時間某天
for deck_id, place in (("horror", ""), ("erotic", ""), ("first", ""), ("daily", "")):
    rec = {"archetype": "好奇", "libido": "SS", "regionId": "kinki"}
    got = sc.draw_story(rec, DECK, deck_id, NOW, place=place, rnd=random.Random(1).random)
    assert got and len(got["cards"]) == 4, deck_id
    item = sc.commit_story(rec, got)
    assert item["text"], deck_id

# 同一張起牌，膽小和好奇的妹子大多走向不同的轉
def ten_dist(trait):
    r = random.Random(7)
    out = Counter()
    for _ in range(300):
        rec = {"archetype": trait, "libido": "R", "regionId": "kanto"}
        s = sc.draw_story(rec, [c for c in DECK if c["id"] == "kuchisake" or c["slot"] != "起"], "horror", NOW, place="alley", rnd=r.random)
        out[s["cards"][2]["id"]] += 1
    return out

timid, curious = ten_dist("膽小"), ten_dist("好奇")
assert timid["horror-ten-run"] > curious["horror-ten-run"] * 2, (timid, curious)
assert curious["horror-ten-touch"] > timid["horror-ten-touch"] * 2, (timid, curious)
print(f"ok {len(DECK)} 張；膽小 {dict(timid)}；好奇 {dict(curious)}")
