"""交友線 30 天模擬（不叫模型，用範本）。python tests/friend_sim.py > /workspace/shots/friend-sim.txt

她整段都在日本（沒被召喚），飢渴照 RP5 副本漲（手機 hunger.js 同一套）、外面做愛會降。
每個設定跑幾個 seed；最後另跑 2000 次「光著身子離房」看次數與對象分布。
"""
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import life_agent as la  # noqa: E402
import life_friends as LF  # noqa: E402
from life_sim import START, hm  # noqa: E402

PROFILES = [
    {"name": "陌生・高飢渴", "stage": "stranger", "loyalty": 50, "libido": "SSR", "hunger": 90, "arch": "活潑開朗"},
    {"name": "女友・中等", "stage": "girlfriend", "loyalty": 60, "libido": "R", "hunger": 50, "arch": "文靜溫柔"},
    {"name": "妻子・高忠誠", "stage": "wife", "loyalty": 90, "libido": "S", "hunger": 40, "arch": "御姊"},
]


def run(pf, days, seed, detail):
    rng = random.Random(seed)
    store = la.new_store()
    g = {"id": "a", "name": "小夜", "stage": pf["stage"], "chrono": {"name": "隨和好睡"}, "archetype": pf["arch"],
         "hobbies": [{"name": "散步"}], "libido": {"grade": pf["libido"]}, "stats": {"loyalty": pf["loyalty"]},
         "bodyState": {"hunger": {"level": pf["hunger"], "at": START, "lifeTaken": 0}},
         "world": {"home": {"id": "market-flat", "name": "超市樓上的一房"}, "regionId": "kanto",
                   "ground": {"id": "asakusa", "name": "淺草", "spots": {"shrine": "淺草寺", "river": "隅田川河岸"}}}}
    la.absorb(store, {"succubi": [g], "roomMirror": {"present": False}}, START, rng.random)
    rec = store["girls"]["a"]
    out = []
    t, end, step = START, START + days * 24 * la.HOUR_MS, 5 * 60 * 1000
    per_day = [Counter() for _ in range(days)]
    hunger_day = [0.0] * days
    while t < end:
        d = (t - START) // (24 * la.HOUR_MS)
        la.quick_step(store, t, rng.random)
        gid = la.next_due(store, t)
        if gid:
            a = la.prepare_resolve(store, gid, t, rng.random)
            ev = a["event"]
            la.settle(store, gid, a["until"], "", t, rng.random)
            b = ev.get("bond")
            if b:
                key = "退回認識" if b.get("regress") else ("又做了" if b["to"] == b["from"] else f"→{LF.STAGE_ZH[b['to']]}")
                per_day[d][key] += 1
                if b.get("sex"):
                    per_day[d]["做愛"] += 1
                if detail:
                    p = ev.get("person") or {}
                    out.append(f"  {hm(t)} {p.get('role')}{p.get('name')}（{LF.INTENT_BY_ID.get(b.get('intent') or '', {}).get('name', '')}）"
                               f" {LF.STAGE_ZH[b['from']]}→{LF.STAGE_ZH[b['to']]}{' ＋做愛' if b.get('sex') else ''}"
                               f"　飢渴≈{la.hunger_estimate(rec, t):.0f} 忠誠≈{la.loyalty_now(rec):.0f}")
        if t % (24 * la.HOUR_MS) < step:
            pass
        hunger_day[d] += la.hunger_estimate(rec, t) * step / (24 * la.HOUR_MS)
        t += step
    return rec, per_day, hunger_day, out


def main():
    days = 30
    print("交友線 30 天模擬（她都在日本、沒被召喚；文字用範本）")
    print("規則：每次再碰到最多一步；同事 1.0／顧客 0.6／路人 0.45；越線乘 關係×忠誠×飢渴×心情×個性。")
    print()
    for pf in PROFILES:
        print(f"=== {pf['name']}：關係 {pf['stage']}、忠誠 {pf['loyalty']}、性慾 {pf['libido']}、起始飢渴 {pf['hunger']}、{pf['arch']} ===")
        print(f"越線倍率（飢渴 50）＝{LF.cross_mult(pf['stage'], pf['loyalty'], 50, '平靜', pf['arch']):.3f}；飢渴 100＝{LF.cross_mult(pf['stage'], pf['loyalty'], 100, '平靜', pf['arch']):.3f}")
        agg = Counter()
        stages = Counter()
        for seed in range(1, 6):
            rec, per_day, hunger_day, out = run(pf, days, seed, detail=(seed == 1))
            tot = sum(per_day, Counter())
            agg.update(tot)
            for m in rec["met"]:
                stages[LF.stage_of(m)] += 1
            if seed == 1:
                print("seed 1 每一步：")
                print("\n".join(out) if out else "  （沒有任何一步）")
                print("seed 1 每天：")
                for i, c in enumerate(per_day):
                    if c:
                        print(f"  第{i + 1:2d}天 平均飢渴 {hunger_day[i]:5.1f}　" + "、".join(f"{k}×{v}" for k, v in sorted(c.items())))
                print(f"  30 天平均飢渴 {sum(hunger_day) / days:.1f}；外面做愛降飢渴共 {rec.get('hungerRelief', 0)}；忠誠掉 {rec.get('loyaltyLoss', 0)}")
                print("  名單：" + "；".join(f"{m['role']}{m['name'] if m.get('named') else ''} {LF.STAGE_ZH[LF.stage_of(m)]}"
                                         f"{'・' + LF.INTENT_BY_ID[m['intent']]['name'] if m.get('intent') else ''}{'・做過' + str(m['sexCount']) + '次' if m.get('sexCount') else ''}"
                                         for m in rec["met"] if LF.stage_of(m) != "seen") or "  名單：（只有見過的人）")
        print(f"5 個 seed 合計（每 30 天平均）：" + "、".join(f"{k} {v / 5:.1f}" for k, v in sorted(agg.items())))
        print(f"30 天後名單各階（5 seed 平均）：" + "、".join(f"{LF.STAGE_ZH[k]} {stages[k] / 5:.1f}" for k in LF.STAGES))
        print()

    print("=== 光著身子離房（各設定 2000 次；70% 出事）===")
    for pf in PROFILES:
        rng = random.Random(7)
        for hunger in (30, 90):
            counts, results, who = [], Counter(), Counter()
            for i in range(2000):
                rec = la._blank("a")
                rec.update({"phase": "japan", "libido": pf["libido"], "stage": pf["stage"],
                            "hungerEst": {"level": hunger, "at": START}, "loyaltySeen": pf["loyalty"]})
                rec["met"] = [{"id": "f1", "name": "佐藤", "role": "同事", "named": True, "stage": "friend"},
                              {"id": "f2", "name": "鈴木", "role": "路人", "named": True, "stage": "physical", "sexCount": 2}] if i % 2 else []
                ev = la.start_naked(rec, f"k{i}", START, rng.random)
                if not ev:
                    results["直接回家"] += 1
                    continue
                n = ev["naked"]
                counts.append(n["count"])
                results[{"anon": "陌生人・沒留下", "physical": "肉體", "fwb": "炮友"}[n["result"]]] += 1
                who["認識的人" if n["known"] else "陌生人"] += 1
            avg = sum(counts) / max(1, len(counts))
            dist = Counter("1-4" if c < 5 else "5-10" if c <= 10 else "11-15" for c in counts)
            print(f"{pf['name']}（性慾 {pf['libido']}）飢渴 {hunger}：出事 {len(counts) / 20:.1f}%；平均 {avg:.1f} 次；次數 {dict(dist)}；"
                  f"對象 {dict(who)}（一半樣本有認識的人）；結果 {dict(results)}；飢渴降 ≈{LF.naked_relief(round(avg))}")


if __name__ == "__main__":
    main()
