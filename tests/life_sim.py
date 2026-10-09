"""模擬她在日本過 N 天（不叫模型，用範本）。python tests/life_sim.py [天數] > 檔案

每 5 分鐘跑一輪 quick_step＋最多一件結算，跟 RP5 一樣。印出每一件、心情變化、碰到的人、SCP。
"""
import random
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import life_agent as la  # noqa: E402

TOKYO = ZoneInfo("Asia/Tokyo")
START = int(datetime(2026, 10, 12, 9, 0, tzinfo=TOKYO).timestamp() * 1000)


def hm(ms):
    return datetime.fromtimestamp(ms / 1000, TOKYO).strftime("%m/%d %H:%M")


def run(chrono, days, seed, ground="asakusa", mood="平靜", level=0):
    rng = random.Random(seed)
    store = la.new_store()
    g = {"id": "a", "name": "小夜", "chrono": {"name": chrono}, "archetype": "溫柔", "hobbies": [{"name": "散步"}],
         "world": {"home": {"id": "market-flat", "name": "超市樓上的一房"}, "regionId": "kanto", "mood": mood,
                   "moodLevel": level, "moodAt": START,
                   "ground": {"id": ground, "name": ground, "spots": {"shrine": "淺草寺", "river": "隅田川河岸", "bridge": "吾妻橋"}}}}
    data = {"succubi": [g], "roomMirror": {"present": False}}
    la.absorb(store, data, START, rng.random)
    rec = store["girls"]["a"]
    out = [f"=== {chrono or '（沒寫作息）'}　起始心情 {mood}{level or ''}　seed {seed} ==="]
    t = START
    end = START + days * 24 * la.HOUR_MS
    counts = {k: 0 for k in la.KINDS}
    while t < end:
        la.quick_step(store, t, rng.random)  # 排下一件、沒做夢的睡醒
        gid = la.next_due(store, t)
        if gid:
            a = la.prepare_resolve(store, gid, t, rng.random)
            la.settle(store, gid, a["until"], "", t, rng.random)  # 文字＝範本
        last = rec.get("last") or {}
        if last.get("at") and last.get("_shown") is None:
            last["_shown"] = True
            counts[last["kind"]] += 1
            out.append(line(last, rec))
        t += 5 * 60 * 1000
    per_day = "、".join(f"{la.KIND_ZH[k]} {v / days:.1f}" for k, v in counts.items())
    out.append(f"每天平均：{per_day}")
    out.append(f"結尾：認識名字的人 {sum(1 for m in rec['met'] if m.get('named'))}／碰過 {len(rec['met'])}；SCP 進度 {rec.get('scpSteps') or '無'}；最後心情 {rec.get('mood')}{rec.get('moodLevel') or ''}")
    out.append("")
    return "\n".join(out)


def line(last, rec):
    return f"{hm(last['at'])} 結束 {la.KIND_ZH[last['kind']]}｜{last.get('text') or '（沒寫記憶）'}｜心情 {last['moodBefore']}→{last['moodAfter']}{rec.get('moodLevel') or ''}" + (f"（{rec.get('moodWhy')}）" if rec.get("moodWhy") else "") + (f"｜{last['scp']}" if last.get("scp") else "")


if __name__ == "__main__":
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    print(f"日本時間；起點 {hm(START)}；每 5 分鐘一輪；沒叫模型，文字是範本。每行＝一件做完時寫下的事。\n")
    for i, (chrono, mood, level) in enumerate([
        ("夜貓子", "平靜", 0), ("早起型", "平靜", 0), ("愛睡午覺", "愉快", 50),
        ("淺眠易怒", "不安", 70), ("隨和好睡", "低落", 60),
    ]):
        print(run(chrono, days, 100 + i, mood=mood, level=level))
