"""模擬她在日本過 N 天（不叫模型，用範本）。python tests/life_sim.py [天數] > 檔案

每 5 分鐘跑一輪 quick_step＋最多一件結算，跟 RP5 一樣。印出每一件、心情變化、碰到的人、SCP。
"""
import random
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import life_agent as la  # noqa: E402

TOKYO = ZoneInfo("Asia/Tokyo")
START = int(datetime(2026, 10, 12, 9, 0, tzinfo=TOKYO).timestamp() * 1000)


def hm(ms):
    return datetime.fromtimestamp(ms / 1000, TOKYO).strftime("%m/%d %H:%M")


def run(chrono, days, seed, ground="asakusa", mood="平靜", level=0, detail=True, libido="R", hunger=30):
    rng = random.Random(seed)
    store = la.new_store()
    g = {"id": "a", "name": "小夜", "chrono": {"name": chrono}, "archetype": "溫柔", "hobbies": [{"name": "散步"}],
         "libido": {"grade": libido}, "bodyState": {"hunger": {"level": hunger, "lifeTaken": 0}},
         "world": {"home": {"id": "market-flat", "name": "超市樓上的一房"}, "regionId": "kanto", "mood": mood,
                   "moodLevel": level, "moodAt": START,
                   **({"ground": {"id": ground, "name": ground, "spots": {"shrine": "淺草寺", "river": "隅田川河岸", "bridge": "吾妻橋"}}} if ground else {})}}
    data = {"succubi": [g], "roomMirror": {"present": False}}
    la.absorb(store, data, START, rng.random)
    rec = store["girls"]["a"]
    out = [f"=== {chrono or '（沒寫作息）'}　起始心情 {mood}{level or ''}　性慾 {libido}　{'落腳 ' + ground if ground else '沒有落腳地'}　seed {seed}　{days} 天 ==="]
    t = START
    end = START + days * 24 * la.HOUR_MS
    step = 5 * 60 * 1000
    days_rows = [{"hours": {k: 0.0 for k in la.KINDS}, "count": {k: 0 for k in la.KINDS}, "people": 0, "scp": [], "ero": [], "hunger": 0} for _ in range(days)]
    while t < end:
        day = days_rows[(t - START) // (24 * la.HOUR_MS)]
        la.quick_step(store, t, rng.random)  # 排下一件、在家的事和沒做夢的睡醒直接結算
        gid = la.next_due(store, t)
        if gid:
            a = la.prepare_resolve(store, gid, t, rng.random)
            la.settle(store, gid, a["until"], "", t, rng.random)  # 文字＝範本
        last = rec.get("last") or {}
        if last.get("at") and last.get("_shown") is None:
            last["_shown"] = True
            day["count"][last["kind"]] += 1
            if last.get("person"):
                day["people"] += 1
            if last.get("scp"):
                day["scp"].append(f"{hm(last['at'])} {last['scp']} {last.get('scpStep')}/5")
            if last.get("ero"):
                day["ero"].append(f"{hm(last['at'])} {last['ero']} {last.get('eroStep')}/5")
                day["hunger"] += int(last.get("hunger") or 0)
            if detail:
                out.append(line(last, rec))
        if detail and rec["memories"] and rec["memories"][-1].get("text", "").startswith("今天在住所") and not rec["memories"][-1].get("_shown"):
            rec["memories"][-1]["_shown"] = True
            out.append(f"{hm(t)} 睡前一行（記憶）｜{rec['memories'][-1]['text']}")
        kind = (rec.get("agenda") or {}).get("kind")
        if kind:
            day["hours"][kind] += step / la.HOUR_MS
        t += step
    if detail:
        out.append("")
        for i, d in enumerate(days_rows):
            out.append(f"第 {i + 1} 天　" + day_line(d))
    total = {"hours": {k: sum(d["hours"][k] for d in days_rows) / days for k in la.KINDS},
             "count": {k: sum(d["count"][k] for d in days_rows) / days for k in la.KINDS},
             "people": sum(d["people"] for d in days_rows) / days, "scp": [x for d in days_rows for x in d["scp"]],
             "ero": [x for d in days_rows for x in d["ero"]], "hunger": sum(d["hunger"] for d in days_rows) / days}
    out.append("每天平均　" + day_line(total, avg=True))
    shifts = [d["count"]["work"] for d in days_rows]
    strolls = [d["count"]["stroll"] for d in days_rows]
    out.append(f"打工班數分布 {dict(sorted(Counter(shifts).items()))}；溜達次數分布 {dict(sorted(Counter(strolls).items()))}")
    out.append(f"碰到人 {sum(d['people'] for d in days_rows)} 次（{total['people']:.1f}/天）；認識名字 {sum(1 for m in rec['met'] if m.get('named'))}／記下 {len(rec['met'])} 人")
    out.append(f"SCP 事件 {len(total['scp'])} 次（{len(total['scp']) / days * 7:.1f}/週）：{'、'.join(total['scp']) or '無'}")
    out.append(f"SCP 進度 {rec.get('scpSteps') or '無'}")
    out.append(f"色情奇遇 {len(total['ero'])} 次（{len(total['ero']) / days * 7:.1f}/週），飢渴共 +{rec.get('hungerGiven') or 0}（{total['hunger']:.1f}/天）：{'、'.join(total['ero']) or '無'}")
    out.append(f"色情奇遇進度 {rec.get('eroSteps') or '無'}；最後心情 {rec.get('mood')}{rec.get('moodLevel') or ''}")
    out.append("")
    return "\n".join(out), total, rec


def day_line(d, avg=False):
    awake = sum(v for k, v in d["hours"].items() if k != "sleep") or 1
    home = sum(d["hours"][k] for k in la.HOME_KINDS)
    fmt = (lambda v: f"{v:.1f}") if avg else (lambda v: f"{v:g}")
    hrs = "、".join(f"{la.KIND_ZH[k]} {d['hours'][k]:.1f}h/{fmt(d['count'][k])}次" for k in la.KINDS)
    scp = d["scp"] if isinstance(d["scp"], list) else []
    ero = d["ero"] if isinstance(d["ero"], list) else []
    tail = "" if avg else f"｜SCP {len(scp)}｜色情 {len(ero)}（飢渴 +{d['hunger']}）"
    return f"{hrs}｜在家佔醒著 {home / awake * 100:.0f}%｜碰到人 {fmt(d['people'])}{tail}"


def line(last, rec):
    return f"{hm(last['at'])} 結束 {la.KIND_ZH[last['kind']]}｜{last.get('text') or '（沒寫記憶）'}｜心情 {last['moodBefore']}→{last['moodAfter']}{rec.get('moodLevel') or ''}" + (f"（{rec.get('moodWhy')}）" if rec.get("moodWhy") else "") + (f"｜{last['scp']}" if last.get("scp") else "")


CASES = [("夜貓子", "平靜", 0, "asakusa", "SS"), ("早起型", "平靜", 0, "kanazawa", "R"), ("愛睡午覺", "愉快", 50, "asakusa", "SSR"),
         ("淺眠易怒", "不安", 70, "", "N"), ("隨和好睡", "低落", 60, "kochi", "S")]

if __name__ == "__main__":
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    long_days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    print(f"日本時間；起點 {hm(START)}；每 5 分鐘一輪；沒叫模型，文字是範本。每行＝一件做完時寫下的事（在家的事只在面板顯示，不進記憶；睡前併一行）。")
    print("飢渴：模擬裡手機不收（hungerSeen 固定在起始值），所以機率用的飢渴＝起始值＋累計給的。\n")
    print(f"########## {days} 天逐件 ##########\n")
    for i, (chrono, mood, level, ground, lib) in enumerate(CASES):
        print(run(chrono, days, 100 + i, ground=ground, mood=mood, level=level, libido=lib)[0])
    print(f"########## {long_days} 天總結（每種作息 3 個種子）##########\n")
    summary = []
    for i, (chrono, mood, level, ground, lib) in enumerate(CASES):
        for seed in (200 + i, 300 + i, 400 + i):
            text, total, rec = run(chrono, long_days, seed, ground=ground, mood=mood, level=level, detail=False, libido=lib)
            print(text)
            summary.append((chrono, lib, ground, len(total["scp"]), len(total["ero"]), rec.get("hungerGiven") or 0))
    print("########## 總表（30 天）##########")
    print("作息　性慾　落腳　SCP 步數　色情奇遇步數　飢渴合計")
    for row in summary:
        print("　".join(str(x) for x in row))
    n = len(summary)
    print(f"平均：SCP {sum(r[3] for r in summary) / n:.1f} 步／30 天（{sum(r[3] for r in summary) / n / 30 * 7:.1f}/週）；"
          f"色情奇遇 {sum(r[4] for r in summary) / n:.1f} 步／30 天（{sum(r[4] for r in summary) / n / 30 * 7:.1f}/週）；"
          f"飢渴 +{sum(r[5] for r in summary) / n:.1f}／30 天（{sum(r[5] for r in summary) / n / 30:.2f}/天）")
