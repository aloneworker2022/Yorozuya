"""python tests/line_sim.py [out] — 模擬一天的名冊群（RP5 主動發文＋插話）。模型用假的（照家族／動作挑句子），一半時間當模型沒回走範本。"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import line_group as L  # noqa: E402
import life_agent  # noqa: E402

MIN = 60_000
HOUR = 60 * MIN
START = 1791126000000  # 日本時間 2026-10-05 00:00 左右
rng = random.Random(7)

girls = [
    L_g := {"id": "yuri", "name": "悠梨", "archetype": "病嬌", "roomStage": "wife", "stats": {"proactivity": 72, "jealousy": 98},
            "hobbies": ["料理"], "likes": ["草莓"], "kinks": ["露出癖"], "playerPet": "", "tone": "輕聲、黏人"},
    {"id": "yuki", "name": "小雪", "archetype": "高冷", "roomStage": "girlfriend", "stats": {"proactivity": 28, "jealousy": 55},
     "hobbies": ["閱讀", "天文"], "likes": ["咖啡"], "playerPet": "笨蛋", "tone": "冷淡短句"},
    {"id": "misaki", "name": "美咲", "archetype": "活潑開朗", "roomStage": "friend", "stats": {"proactivity": 86, "jealousy": 30},
     "hobbies": ["料理", "逛街"], "likes": ["草莓", "咖啡"], "tone": "元氣、很多～"},
    {"id": "chika", "name": "千夏", "archetype": "文靜溫柔", "roomStage": "lover", "stats": {"proactivity": 55, "jealousy": 40},
     "hobbies": ["閱讀"], "likes": ["咖啡"], "playerPet": "阿哲", "tone": "溫柔"},
]
data = {"succubi": girls, "settings": {"player": "阿哲", "model": "stub"}, "lineGroup": {"messages": [], "affinity": {}}}
# 作息：睡覺（日本時間）、打工
SLEEP = {"yuri": (3, 11), "yuki": (0, 7), "misaki": (23.5, 7), "chika": (1, 8)}
WORK = {"misaki": (12, 16), "yuki": (18, 22), "chika": (9, 13)}
MEALS = ["拉麵", "便利商店飯糰", "咖哩", "布丁"]


def hour_of(ms):
    return life_agent.jst_hour(ms)


def inside(h, a, b):
    return a <= h < b if a < b else (h >= a or h < b)


def life_at(now):
    out = {}
    h = hour_of(now)
    for g in girls:
        gid = g["id"]
        rec = {"id": gid, "phase": "japan", "agenda": None, "memories": [], "homeName": "公寓", "hungerSeen": 85 if gid == "yuri" else 30}
        if inside(h, *SLEEP[gid]):
            rec["agenda"] = {"kind": "sleep", "until": now + HOUR}
        elif gid in WORK and inside(h, *WORK[gid]):
            rec["agenda"] = {"kind": "work", "until": now + HOUR}
            rec["job"] = {"name": "居酒屋" if gid == "misaki" else "書店"}
        elif gid in WORK and inside(h, WORK[gid][1], WORK[gid][1] + 1):
            rec["last"] = {"kind": "work", "at": now - 20 * MIN}
            rec["memories"] = [{"at": now - 20 * MIN, "text": f"打工結束，{'居酒屋今天客人超多，腳好痠' if gid == 'misaki' else '店裡很安靜，整理了一櫃新書'}。"}]
        out[gid] = rec
    if inside(h, 20, 21):
        out["chika"]["phase"] = "room"   # 晚上被召喚到他房間一小時
    return {"girls": out}


STUB = {
    ("佔有", "post"): ["老公今天還沒召喚我。", "……在幹嘛。回我。", "我煮了你喜歡的，雖然你吃不到。"],
    ("佔有", "post@"): ["老公，今天什麼時候召喚我？\n我等你喔。", "老公～身體好熱…什麼時候叫我過去嘛。"],
    ("冷淡", "post"): ["睡不著。", "……今天好吵。", "看完一本書了。"],
    ("冷淡", "post@"): ["笨蛋，在幹嘛。", "……沒事，只是問問。"],
    ("熱絡", "post"): ["剛下班！今天居酒屋超忙，腳好痠～", "早安～今天天氣超好！", "我吃了{meal}！超好吃！"],
    ("熱絡", "post@"): ["阿哲阿哲～你今天在幹嘛！"],
    ("溫柔", "post"): ["大家今天也辛苦了。", "泡了咖啡，好香呢。", "剛整理完書櫃，有點累。"],
    ("溫柔", "post@"): ["阿哲，今天也要好好吃飯喔。\n我有點想你。"],
    ("佔有", "claim"): ["……他是我老公喔。", "別忘了他是誰的人。"],
    ("佔有", "needle"): ["……你都沒這樣跟我說過。"],
    ("冷淡", "needle"): ["……哼，真好命。"],
    ("冷淡", "tease"): ["……又來了。", "吵。"],
    ("冷淡", "agree"): ["嗯。", "……還行。"],
    ("冷淡", "chat"): ["不要。", "……然後？"],
    ("熱絡", "tease"): ["哈哈哈，悠梨每天都這樣欸", "又在放閃了啦！"],
    ("熱絡", "agree"): ["對啊對啊！", "我也是～"],
    ("熱絡", "chat"): ["我也還醒著！要不要聊天？", "真的假的！然後呢？"],
    ("溫柔", "agree"): ["辛苦了，早點休息喔。", "嗯嗯，我也這麼覺得。"],
    ("溫柔", "chat"): ["要不要喝點熱的？", "慢慢來就好。"],
    ("溫柔", "tease"): ["好了好了，不要吵架嘛。"],
    ("佔有", "tease"): ["……妳很吵。", "關妳什麼事。"],
    ("佔有", "agree"): ["嗯。"],
    ("佔有", "chat"): ["……是喔。"],
}


def stub_llm(job, girl):
    if rng.random() < 0.5:
        return ""  # 模型沒回 → 範本
    fam = L.family_of(girl)
    key = (fam, "post@" if job.get("at") == "player" else "post") if job["kind"] == "post" else (fam, job["act"])
    pool = STUB.get(key) or ["嗯。"]
    return rng.choice(pool).replace("{meal}", rng.choice(MEALS))


def main(out):
    store = L.new_store()
    lines = []
    by = {g["id"]: g for g in girls}
    tick = 45 * 1000
    now = START
    llm_calls = 0
    while now < START + 24 * HOUR:
        lf = life_at(now)
        job = L.step(store, data, lf, now, rng.random)
        if job:
            g = by[job["gid"]]
            raw = stub_llm(job, g)
            llm_calls += 1
            got = L.accept(raw, g) or L.canned(job, g, rng.random, store)
            msgs = L.commit(store, job, g, got, data, lf, now, rng.random)
            if job["kind"] == "react" and job["act"] in L.AFF_DELTA:
                L.bump_affinity(data["lineGroup"]["affinity"], g, by[job["target"]], L.AFF_DELTA[job["act"]], now)
            for m in msgs:
                tag = "主動" if job["kind"] == "post" else f"{job['act']}→{by[job['target']]['name']}"
                at = "＠他" if job.get("at") == "player" else ""
                src = "" if raw and L.accept(raw, g) else "（範本）"
                lines.append(f"{life_agent.japan_clock(m['t'])['label']}  {g['name']}：{m['text']}   [{tag}{at}]{src}")
        now += tick
    posts = sum(1 for m in store["feed"])
    per = {}
    for m in store["feed"]:
        per[m["name"]] = per.get(m["name"], 0) + 1
    aff = data["lineGroup"]["affinity"]
    head = [
        "名冊群一天模擬（RP5 主動發文＋插話；模型是假的，一半走範本）",
        "成員：悠梨（病嬌・妻子・主動72・嫉妒98・飢渴85）、小雪（高冷・女友・主動28）、美咲（活潑開朗・朋友・主動86）、千夏（文靜溫柔・愛人・主動55，20–21 點在他房間）",
        f"一天共 {posts} 則，模型呼叫 {llm_calls} 次（一輪最多一次）。每人：" + "、".join(f"{k} {v}" for k, v in per.items()),
        "合不合（一天後）：" + "、".join(f"{by[k.split('|')[0]]['name']}×{by[k.split('|')[1]]['name']} {L.affinity_now(v, now):.0f}（初始 {v['seed']}）" for k, v in aff.items()),
        "",
    ]
    Path(out).write_text("\n".join(head + lines) + "\n", encoding="utf-8")
    print("\n".join(head))


main(sys.argv[1] if len(sys.argv) > 1 else "/workspace/shots/line-sim.txt")
