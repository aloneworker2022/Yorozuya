"""python tests/japan_worldbook_test.py"""
import copy
import random
import re
import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import japan_worldbook as world
import life_agent as life
import life_data as data
from life_anomalies import EVENTS

NOW = 1795852800000


class WorldTests(unittest.TestCase):
    def test_all_live_locations_and_travel_destinations_covered(self):
        source = (Path(__file__).resolve().parents[1] / "web/content/japan_grounds.js").read_text(encoding="utf-8")
        ground_ids = re.findall(r'^    id: "([^"]+)"', source, re.M)
        self.assertEqual(len(ground_ids), 16)
        self.assertTrue(set(ground_ids) <= world.PLACES.keys())
        self.assertEqual(set(life.TRAVEL_SPOTS), set(world.TRAVEL_IDS))
        for dest in life.TRAVEL_SPOTS:
            self.assertIsNotNone(world.lookup(destination=dest), dest)

    def test_unknown_destination_never_inherits_residence(self):
        self.assertIsNone(world.lookup("asakusa", "尚未收錄的地方"))
        self.assertNotIn("淺草", world.context("asakusa", "尚未收錄的地方"))

    def test_seasons_use_japan_month(self):
        for month, index in ((1, 3), (3, 0), (6, 1), (9, 2), (12, 3)):
            at = datetime(2026, month, 1, tzinfo=ZoneInfo("Asia/Tokyo")).timestamp() * 1000
            self.assertIn(world.PLACES["naha"]["seasons"][index], world.context("naha", at=at))
        self.assertNotIn("當季可能景象（不是今日天氣）：雪", world.context("naha", at=NOW))

    def test_travel_roll_uses_destination_and_preserves_home(self):
        rec = life._blank("world-test")
        rec.update(groundId="asakusa", groundName="淺草", regionId="kanto",
                   spots={k: "淺草住處" for k in world.PLACES["asakusa"]["spots"]},
                   agenda={"dest": "金澤"})
        before = copy.deepcopy(rec)
        found_anomaly = False
        for seed in range(180):
            ev = life.roll_event(rec, "travel", NOW, random.Random(seed).random)
            self.assertEqual(ev["groundId"], "kanazawa")
            self.assertNotIn("淺草", ev["place"])
            self.assertTrue(any(x in ev["place"] for x in world.PLACES["kanazawa"]["spots"].values()))
            if ev.get("scp"):
                found_anomaly = True
                chosen = next(e for e in data.SCP_EVENTS if e["id"] == ev["scp"]["id"])
                self.assertTrue(chosen.get("generic") or "kanazawa" in chosen.get("grounds", []))
        self.assertTrue(found_anomaly)
        self.assertEqual(rec, before)

    def test_prompt_contains_only_current_city_worldbook(self):
        _, prompt = life.event_prompt(dict(name="小夜", groundId="asakusa", groundName="淺草", until=NOW,
            event=dict(kind="travel", travel="金澤", place="近江町市場", act="買點心")))
        self.assertIn("所在地世界書：金澤", prompt)
        self.assertIn("近江町市場", prompt)
        self.assertNotIn("淺草", prompt)
        self.assertIn("不要求發 LINE", prompt)

    def test_anomaly_catalog_and_all_stages_reachable_without_restart(self):
        ids = [e["id"] for e in data.SCP_EVENTS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(ids), 47)
        for event in EVENTS:
            self.assertEqual(len(event["stages"]), 5)
            rec = life._blank("g")
            rec["groundId"] = next(iter(event["grounds"]), "asakusa")
            where = "work" if event["work"] else "stroll"
            # Finish all other stories; the target is now the only available story.
            rec["scpSteps"] = {e["id"]: len(e["stages"]) for e in data.SCP_EVENTS}
            outputs = []
            for step in range(5):
                rec["scpSteps"][event["id"]] = step
                got = life.roll_scp(rec, where, "平靜", 0, lambda: 0, now_ms=NOW)
                self.assertEqual(got["id"], event["id"])
                self.assertEqual(got["prior"], event["stages"][:step])
                outputs.append(life.fallback_text({"event": {"kind": "stroll", "place": "街角", "scp": got}}))
            self.assertEqual(len(set(outputs)), 5)
            rec["scpSteps"][event["id"]] = 5
            self.assertIsNone(life.roll_scp(rec, where, "平靜", 0, lambda: 0, now_ms=NOW))

    def test_anomalies_respect_existing_cooldown(self):
        rec = life._blank("g")
        rec["scpNextAt"] = NOW + life.HOUR_MS
        self.assertIsNone(life.roll_scp(rec, "work", "不安", 100, lambda: 0, now_ms=NOW))


if __name__ == "__main__":
    unittest.main()
