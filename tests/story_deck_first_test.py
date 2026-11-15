"""python tests/story_deck_first_test.py — 「第一次」牌（server/story_deck_first.py）"""
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import story_cards as sc  # noqa: E402
import story_deck_first as fd  # noqa: E402

WINTER = int(datetime(2026, 1, 20, 14, 0, tzinfo=ZoneInfo("Asia/Tokyo")).timestamp() * 1000)
SUMMER = int(datetime(2026, 8, 10, 14, 0, tzinfo=ZoneInfo("Asia/Tokyo")).timestamp() * 1000)

starts = [c for c in fd.FIRST_DECK if c["slot"] == "起"]
assert len(starts) == 10 and all(c["deck"] == "first" for c in fd.FIRST_DECK)

# 每一張起牌都接得到合，而且膽小和好奇走不同的轉、合
for s in starts:
    now = WINTER if "winter" in (s.get("season") or ["winter"]) else SUMMER
    place = (s.get("place") or ["station"])[0]
    deck = [c for c in fd.FIRST_DECK if c["slot"] != "起" or c is s]
    ends = {}
    for who in ("膽小", "好奇"):
        st = sc.draw_story({"personality": [who]}, deck, "first", now, place=place, rnd=lambda: 0.5)
        assert st, (s["id"], who)
        assert st["cards"][-1]["learn"]["text"]
        ends[who] = st["cards"][-1]["id"]
    assert ends["膽小"] != ends["好奇"], s["id"]

# 季節牌不會在錯的季節出現
deck_snow = [c for c in fd.FIRST_DECK if c["id"].endswith("snow") or "-snow" in c["id"]]
assert sc.draw_story({}, deck_snow, "first", SUMMER, place="river") is None
print("story_deck_first ok")
