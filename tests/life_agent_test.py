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
    assert la.duration_ms("browse", lambda: 0.1) == la.BROWSE_MS
    assert la.duration_ms("browse", lambda: 0.9) == 30 * 60 * 1000
    assert la.duration_ms("idle", lambda: 0.99) == 30 * 60 * 1000
    assert la.duration_ms("tidy", lambda: 0.99) == la.HOUR_MS
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
    assert la.needs_choice(store["girls"]["a"]) and la.needs_choice(store["girls"]["b"])
    logs = la.quick_step(store, NOW, lambda: 0.2)
    assert len(logs) == 2  # 排下一件不用模型，一輪全部排完
    assert not la.needs_choice(store["girls"]["a"])
    assert la.plan_tick(store, NOW + 1000) == []  # 還沒有到期的

    gid = "a"
    la.arm(store["girls"][gid], "work", NOW, lambda: 0.2)
    armed = store["girls"][gid]["agenda"]
    assert armed["until"] == NOW + la.WORK_MS
    assert not la.is_due(store["girls"][gid], NOW + la.HOUR_MS)
    assert la.is_due(store["girls"][gid], NOW + la.WORK_MS)
    assert la.apply_resolve(store, gid, armed["until"], "我做完這班，跟同事說了再見，他也揮手。", "work", NOW + la.WORK_MS, "browse", lambda: 0.1)
    nxt = store["girls"][gid]["agenda"]
    assert nxt["kind"] == "browse"
    assert nxt["until"] == NOW + la.WORK_MS + la.BROWSE_MS
    assert not la.apply_resolve(store, gid, armed["until"], "再寫一次", "work", NOW + la.WORK_MS, "work", lambda: 0)

    print("ok - life agent")
    schedule_tests()
    mood_tests()
    encounter_tests()
    text_tests()
    merge_tests()
    home_tests()
    mirror_tests()
    print("ok - life agent schedule/mood/encounters/home")


def jst(y, mo, d, h, mi=0):
    return int(datetime(y, mo, d, h, mi, tzinfo=ZoneInfo("Asia/Tokyo")).timestamp() * 1000)


class Seq:
    """固定的骰子序列，用完就重複最後一個。"""

    def __init__(self, *vals):
        self.vals = list(vals) or [0.5]
        self.i = 0

    def __call__(self):
        v = self.vals[min(self.i, len(self.vals) - 1)]
        self.i += 1
        return v


def japan_rec(chrono="", mood="平靜", level=0, at=0, job=None):
    store = la.new_store()
    g = girl()
    g["chrono"] = {"name": chrono}
    g["world"]["mood"] = mood
    g["world"]["moodLevel"] = level
    g["world"]["moodAt"] = at
    g["world"]["ground"] = {"id": "asakusa", "name": "東京都台東區淺草", "spots": {"shrine": "淺草寺", "river": "隅田川河岸"}}
    if job:
        g["world"]["job"] = job
    la.absorb(store, save([g]), at or NOW, lambda: 0)
    rec = store["girls"]["a"]
    return store, rec


def schedule_tests():
    # 睡覺時段：夜貓子 03:30～11:30、早起型 21:30～05:30
    owl = la.sleep_info("夜貓子", jst(2026, 10, 7, 9))
    assert owl["asleep"] and owl["wakeAt"] == jst(2026, 10, 7, 11, 30)
    early = la.sleep_info("早起型", jst(2026, 10, 7, 23))
    assert early["asleep"] and early["wakeAt"] == jst(2026, 10, 8, 5, 30)
    assert not la.sleep_info("早起型", jst(2026, 10, 7, 9))["asleep"]
    nap = la.sleep_info("愛睡午覺", jst(2026, 10, 7, 13, 30))
    assert nap["asleep"] and nap["nap"] and nap["wakeAt"] == jst(2026, 10, 7, 15)

    # 睡覺時段裡一定是睡覺，睡到時段結束
    store, rec = japan_rec("夜貓子", at=jst(2026, 10, 7, 5))
    kind, ms = la.pick_next(rec, jst(2026, 10, 7, 5), Seq(0.0))
    assert kind == "sleep" and ms == jst(2026, 10, 7, 11, 30) - jst(2026, 10, 7, 5)
    # 離睡覺 30 分內就去睡
    store, rec = japan_rec("早起型", at=jst(2026, 10, 7, 21, 10))
    kind, ms = la.pick_next(rec, jst(2026, 10, 7, 21, 10), Seq(0.0))
    assert kind == "sleep" and jst(2026, 10, 7, 21, 10) + ms == jst(2026, 10, 8, 5, 30)
    # 不會開一個吃進睡覺時段的四小時班：早起型 19:00 起（離 21:30 只剩 2.5 小時）
    store, rec = japan_rec("早起型", at=jst(2026, 10, 7, 19))
    assert la.choice_weights(rec, jst(2026, 10, 7, 19))["work"] == 0
    for r in [i / 50 for i in range(50)]:
        k, _ = la.pick_next(rec, jst(2026, 10, 7, 19), Seq(r, 0.3))
        assert k != "work"
    # 夜貓子 23:00 前還能打夜班；白天班的人深夜權重低
    store, rec = japan_rec("夜貓子", at=jst(2026, 10, 7, 18), job={"id": "izakaya", "name": "居酒屋端盤子"})
    w_night = la.choice_weights(rec, jst(2026, 10, 7, 18))["work"]
    store, rec2 = japan_rec("夜貓子", at=jst(2026, 10, 7, 18), job={"id": "cashier", "name": "超市收銀"})
    w_day = la.choice_weights(rec2, jst(2026, 10, 7, 22))["work"]
    assert w_night > w_day > 0
    # 打工後不會馬上再打工；24 小時內最多兩班
    store, rec = japan_rec("", at=jst(2026, 10, 7, 9), job={"id": "ramen", "name": "拉麵店洗碗"})
    rec["history"] = ["work"]
    assert la.choice_weights(rec, jst(2026, 10, 7, 13))["work"] == 0
    rec["history"] = ["work", "browse"]
    rec["workLog"] = [jst(2026, 10, 7, 9)]
    second = la.choice_weights(rec, jst(2026, 10, 7, 14))["work"]
    rec["workLog"] = []
    first = la.choice_weights(rec, jst(2026, 10, 7, 14))["work"]
    assert 0 < second < first
    rec["workLog"] = [jst(2026, 10, 7, 9), jst(2026, 10, 7, 14)]
    assert la.choice_weights(rec, jst(2026, 10, 7, 19))["work"] == 0
    # 不一直重複：剛溜達兩次，溜達權重被壓
    rec["workLog"] = []
    rec["history"] = []
    base = la.choice_weights(rec, jst(2026, 10, 7, 15))["stroll"]
    rec["history"] = ["stroll", "stroll"]
    assert la.choice_weights(rec, jst(2026, 10, 7, 15))["stroll"] < base * 0.25
    # 不賺錢：整個結算不碰金幣
    store, rec = japan_rec("", at=jst(2026, 10, 7, 10), job={"id": "ramen", "name": "拉麵店洗碗"})
    data = save([girl()])
    data["gold"] = 37
    la.arm(rec, "work", jst(2026, 10, 7, 10), Seq(0.1))
    assert la.settle(store, "a", rec["agenda"]["until"], "", jst(2026, 10, 7, 14), Seq(0.3))
    la.overlay(data, store, jst(2026, 10, 7, 14))
    assert data["gold"] == 37
    assert "gold" not in str(store)
    # 舊的 nextAgendaKind 換成 pick_next：沒有手機端的輪替規則了
    assert "sleep" in la.KINDS and "browse" in la.KINDS


def mood_tests():
    t0 = jst(2026, 10, 7, 12)
    store, rec = japan_rec("", "低落", 50, t0)
    assert la.mood_now(rec, t0) == ("低落", 50)
    assert la.mood_now(rec, t0 + 2 * la.HOUR_MS) == ("低落", 42)  # 每小時 −4
    assert la.mood_now(rec, t0 + 10 * la.HOUR_MS) == ("平靜", 0)  # 淡回平靜
    # 同一種疊上去；不同種強的蓋過弱的；平靜是往下壓
    la.apply_mood(rec, "低落", 30, "被責怪", t0)
    assert rec["mood"] == "低落" and rec["moodLevel"] == 62
    la.apply_mood(rec, "愉快", 20, "", t0)
    assert rec["mood"] == "低落" and rec["moodLevel"] == 56
    la.apply_mood(rec, "不安", 50, "怪事", t0)
    assert rec["mood"] == "不安" and rec["moodWhy"] == "怪事"
    la.apply_mood(rec, "平靜", 45, "", t0)
    assert rec["mood"] == "平靜"
    # 虛脫退得快，睡一覺就沒了
    store, rec = japan_rec("", "虛脫", 40, t0)
    assert la.mood_now(rec, t0 + la.HOUR_MS)[1] == 25
    # 從房間帶出去的心情跟著走；人在日本時不吃手機的舊值
    store, rec = japan_rec("", "愉快", 45, t0)
    assert rec["mood"] == "愉快" and rec["moodLevel"] == 45
    g = girl()
    g["world"]["mood"] = "不悅"
    la.absorb(store, save([g]), t0 + 1000, lambda: 0)
    assert rec["mood"] == "愉快"
    # 結果 → 心情
    assert la._outcome({"kind": "work", "emotion": "怒", "actId": "chat", "person": {"name": "x", "role": "顧客"}}, rec, Seq(0))["mood"] == "不悅"
    assert la._outcome({"kind": "work", "emotion": "喜", "actId": "blame", "person": {"name": "x", "role": "顧客"}}, rec, Seq(0))["mood"] == "低落"
    assert la._outcome({"kind": "stroll", "tone": "wonder", "actId": "lucky", "place": "淺草寺"}, rec, Seq(0))["mood"] == "愉快"
    assert la._outcome({"kind": "stroll", "tone": "horror", "actId": "wrong", "place": "淺草寺"}, rec, Seq(0))["mood"] == "不安"
    assert la._outcome({"kind": "stroll", "scp": {"step": 2}, "place": "淺草寺"}, rec, Seq(0)) == {"mood": "不安", "level": 70, "why": "在淺草寺撞見說不清的怪事"}
    assert la._outcome({"kind": "sleep", "nightmare": True}, rec, Seq(0))["mood"] == "不安"
    assert la._outcome({"kind": "sleep"}, rec, Seq(0))["mood"] == "平靜"
    # 睡醒：低落被壓下去、寫不寫記憶看有沒有做夢
    store, rec = japan_rec("", "低落", 40, jst(2026, 10, 7, 0, 30))
    la.arm(rec, "sleep", jst(2026, 10, 7, 0, 30))
    until = rec["agenda"]["until"]
    assert until == jst(2026, 10, 7, 7, 30)
    n_mem = len(rec["memories"])
    la.quick_step(store, until, Seq(0.9))
    assert rec["mood"] == "平靜" and len(rec["memories"]) == n_mem and rec["agenda"]["kind"] != "sleep"
    # 心情 → 下一件：不安時上網權重大幅上升、溜達下降
    store, rec = japan_rec("", "平靜", 0, t0)
    calm = la.choice_weights(rec, t0)
    rec.update({"mood": "不安", "moodLevel": 70, "moodAt": t0})
    scared = la.choice_weights(rec, t0)
    assert scared["browse"] > calm["browse"] * 1.4 and scared["stroll"] < calm["stroll"] * 0.6


def tone_share(mood, level, n=4000):
    import random as _r
    rng = _r.Random(7)
    store, rec = japan_rec("", mood, level, jst(2026, 10, 7, 14))
    rec["groundId"] = ""  # 不讓 SCP 干擾
    counts = {"daily": 0, "wonder": 0, "horror": 0}
    for _ in range(n):
        ev = la.roll_event(rec, "stroll", jst(2026, 10, 7, 14), rng.random)
        counts[ev["tone"]] += 1
    return {k: v / n for k, v in counts.items()}


def encounter_tests():
    calm = tone_share("平靜", 0)
    assert abs(calm["daily"] - 0.5) < 0.04 and abs(calm["wonder"] - 0.333) < 0.04 and abs(calm["horror"] - 0.167) < 0.03
    happy = tone_share("愉快", 70)
    scared = tone_share("不安", 70)
    assert happy["wonder"] > calm["wonder"] + 0.1 and happy["horror"] < calm["horror"]
    assert scared["horror"] > calm["horror"] * 2 and scared["wonder"] < calm["wonder"]
    # SCP：第一次 1/15，開始後 1/2；心情不安放大、愉快縮小；有上限
    assert abs(la.scp_chance(False, "平靜", 0) - 1 / 40) < 1e-9
    assert abs(la.scp_chance(True, "平靜", 0) - 1 / 8) < 1e-9
    assert la.scp_chance(False, "不安", 60) > la.scp_chance(False, "平靜", 0) * 1.9
    assert la.scp_chance(False, "愉快", 60) < 1 / 40
    assert la.scp_chance(True, "不安", 100, eerie=True, night=True) == la.SCP_NEXT_CAP
    # 綁地點：淺草只會碰到 SCP-173；三步走完就不會再出
    store, rec = japan_rec("", "平靜", 0, jst(2026, 10, 7, 14))
    seen = []
    for i in range(3):
        scp = la.roll_scp(rec, "stroll", "平靜", 0, Seq(0.0, 0.0))
        assert scp and scp["code"] == "SCP-173" and scp["step"] == i
        seen.append(scp["stage"])
        rec["scpSteps"][scp["id"]] = scp["step"] + 1
    assert la.roll_scp(rec, "stroll", "平靜", 0, Seq(0.0, 0.0)) is None
    rec["groundId"] = "kanazawa"
    assert la.roll_scp(rec, "stroll", "平靜", 0, Seq(0.0, 0.0)) is None
    assert la.roll_scp(rec, "work", "平靜", 0, Seq(0.0, 0.0))["code"] != "SCP-173"  # 173 走完了，其他 work 的
    # 開始後再遇到 1/2 進下一步
    store, rec = japan_rec("", "平靜", 0, jst(2026, 10, 7, 14))
    rec["scpSteps"] = {"173": 1}
    assert la.roll_scp(rec, "stroll", "平靜", 0, Seq(0.12, 0.0))["step"] == 1
    assert la.roll_scp(rec, "stroll", "平靜", 0, Seq(0.13, 0.0)) is None
    # 兩步之間至少 10 天
    t1 = jst(2026, 10, 7, 14)
    rec["scpAt"] = t1
    assert la.roll_scp(rec, "stroll", "平靜", 0, Seq(0.0, 0.0), now_ms=t1 + 9 * 24 * la.HOUR_MS) is None
    assert la.roll_scp(rec, "stroll", "平靜", 0, Seq(0.0, 0.0), now_ms=t1 + 11 * 24 * la.HOUR_MS)["step"] == 1
    # 打工一定碰到人；人記進 met，同事會再碰到
    store, rec = japan_rec("", "平靜", 0, jst(2026, 10, 7, 10), job={"id": "ramen", "name": "拉麵店洗碗"})
    import random as _r
    rng = _r.Random(3)
    t = jst(2026, 10, 7, 10)
    for i in range(12):
        la.arm(rec, "work", t, rng.random)
        until = rec["agenda"]["until"]
        a = la.prepare_resolve(store, "a", until, rng.random)
        assert a["event"]["person"]["role"] in ("同事", "顧客")
        assert la.settle(store, "a", until, "", until, rng.random)
        t = until + 8 * la.HOUR_MS
    met = rec["met"]
    assert met and all(m["where"] == "拉麵店洗碗" for m in met)
    assert any(m["count"] > 1 for m in met)
    mem = [m for m in rec["memories"] if m["kind"] == "work"][-1]
    for key in ("person", "personRole", "moodBefore", "moodAfter", "act"):
        assert key in mem, key
    assert "gold" not in rec and "friends" not in rec  # 不交朋友、不賺錢
    # 心情影響打工遭遇：不悅時爭執／被責怪比較多
    def share(mood, act_ids):
        st, r = japan_rec("", mood, 80, jst(2026, 10, 7, 10), job={"id": "ramen", "name": "拉麵店洗碗"})
        rng2 = _r.Random(11)
        hits = 0
        for _ in range(3000):
            ev = la.roll_event(r, "work", jst(2026, 10, 7, 10), rng2.random)
            hits += ev.get("actId") in act_ids
        return hits / 3000
    assert share("不悅", ("argue", "blame")) > share("愉快", ("argue", "blame")) * 2


def text_tests():
    store, rec = japan_rec("", "平靜", 0, jst(2026, 10, 7, 14))
    rec["archetype"] = "傲嬌"
    la.arm(rec, "stroll", jst(2026, 10, 7, 14), Seq(0.9))
    until = rec["agenda"]["until"]
    a = la.prepare_resolve(store, "a", until, Seq(0.9, 0.5, 0.1, 0.9, 0.2, 0.3))
    assert a and a["event"]["kind"] == "stroll"
    assert a["event"] is rec["agenda"]["event"]  # 擲過就存起來，重試用同一份
    system, user = la.event_prompt(a)
    assert "我" in user and a["event"]["place"] in user and "傲嬌" in user
    fb = la.fallback_text(a)
    assert fb.startswith("我在") and a["event"]["place"] in fb
    assert la.accept_text(a, "") == ""
    assert la.accept_text(a, "好") == ""
    # 有人的事件：沒有對方就不收
    a2 = {"event": {"kind": "work", "job": "拉麵店洗碗", "act": "聊了一陣", "emotion": "喜",
                    "person": {"name": "佐藤翔太", "role": "同事", "named": True, "gender": "male"}, "outcome": {"mood": "愉快"}}}
    assert la.accept_text(a2, "我今天洗了很多碗，手好痠。") == ""
    assert la.accept_text(a2, "名字：佐藤翔太\n我跟佐藤翔太聊起拉麵湯頭，他笑著說我太認真。") .startswith("我跟佐藤")
    assert "佐藤翔太" in la.event_prompt(dict(a2, name="小夜"))[1]
    anon = {"event": dict(a2["event"], person={"name": "鈴木美咲", "role": "顧客", "named": False, "gender": "female"})}
    assert "不要替對方取名字" in la.event_prompt(anon)[1] and "鈴木美咲" not in la.event_prompt(anon)[1]
    assert "一位顧客" in la.fallback_text(anon)
    # 模型沒寫成：settle 用範本，記憶不空
    assert la.settle(store, "a", until, "", until, Seq(0.4))
    assert rec["memories"][-1]["text"] == fb
    # SCP 提示：只給這一步、前面的步驟、不准說編號
    scp = {"id": "173", "code": "SCP-173", "title": "混凝土雕像", "step": 1, "of": 3, "stage": "B", "prior": ["A"]}
    brief = la.scp_brief(scp)
    assert "第 2/3 步" in brief and "1. A" in brief and "不要讓她說出編號" in brief
    assert la.needs_llm({"kind": "sleep"}) is False and la.needs_llm({"kind": "sleep", "nightmare": True}) is True


def merge_tests():
    t0 = jst(2026, 10, 7, 14)
    store, rec = japan_rec("", "平靜", 0, t0, job={"id": "ramen", "name": "拉麵店洗碗"})
    la.arm(rec, "work", t0, Seq(0.1))
    until = rec["agenda"]["until"]
    la.prepare_resolve(store, "a", until, Seq(0.1, 0.1, 0.9, 0.0, 0.9, 0.9))
    rec["agenda"]["event"]["outcome"] = {"mood": "不悅", "level": 45, "why": "被顧客罵"}
    assert la.settle(store, "a", until, "我被那位顧客唸了一頓，他越說越大聲，我只好低頭道歉。", until, Seq(0.5))
    data = save([girl()])
    la.overlay(data, store, until + 1000)
    w = data["succubi"][0]["world"]
    assert w["mood"] == "不悅" and w["moodLevel"] == 45 and w["moodWhy"] == "被顧客罵" and w["moodAt"] == until
    assert w["met"] and w["lastOutside"]["moodAfter"] == "不悅"
    assert any("唸了一頓" in (m.get("text") or "") for m in w["mind"]["immediate"])
    assert "event" not in (w["agenda"] or {})  # 擲好的結果不外流給手機
    # 人在房裡：不蓋手機的心情
    store2 = la.new_store()
    g = girl()
    g["world"]["mood"] = "愉快"
    la.absorb(store2, save([g], present=True, until=t0 + la.HOUR_MS), t0, lambda: 0)
    d2 = save([g], present=True, until=t0 + la.HOUR_MS)
    d2["succubi"][0]["world"]["mood"] = "低落"
    la.overlay(d2, store2, t0)
    assert d2["succubi"][0]["world"]["mood"] == "低落"


def mirror_tests():
    """web/content/life_schedule.js 要跟伺服器同一套數字。"""
    import json as _j
    import re as _re
    js = (Path(__file__).resolve().parents[1] / "web/content/life_schedule.js").read_text()
    def grab(name):
        m = _re.search(rf"export const {name} = (.+?);", js)
        return m.group(1)
    assert _j.loads(grab("OUTSIDE_KINDS")) == list(la.KINDS)
    assert _j.loads(grab("HOME_KINDS")) == list(la.HOME_KINDS)
    assert grab("SCP_FIRST_CHANCE") == "1 / 40" and abs(la.D.SCP_FIRST_CHANCE - 1 / 40) < 1e-12
    assert grab("SCP_NEXT_CHANCE") == "1 / 8" and abs(la.D.SCP_NEXT_CHANCE - 1 / 8) < 1e-12
    assert grab("SCP_GAP_MS") == "10 * 24 * HOUR_MS" and la.SCP_GAP_MS == 10 * 24 * la.HOUR_MS
    for k, v in la.D.HOME_DURATIONS_MIN.items():
        assert f"{k}: {_j.dumps(v)}" in grab("HOME_DURATIONS_MIN"), k
    w = grab("LIFE_WEIGHTS")
    for k in ("stroll", "browse", "idle", "tidy"):
        assert f"{k}: {la.BASE_WEIGHTS[k]}" in w, k
    assert f"workFirst: {la.WORK_FIRST}" in w and f"workSecond: {la.WORK_SECOND}" in w and f"strollPerDay: {la.STROLL_PER_DAY}" in w
    assert _j.loads(grab("MEAL_MIN")) == list(la.D.MEAL_MIN)


def home_tests():
    # 吃飯：早起型 12:10 在午餐時段 → 去吃；吃過 2.5 小時內不再吃
    store, rec = japan_rec("早起型", at=jst(2026, 10, 7, 12, 10))
    assert la.meal_due(rec, jst(2026, 10, 7, 12, 10)) == 1
    kind, ms = la.pick_next(rec, jst(2026, 10, 7, 12, 10), Seq(0.5))
    assert kind == "meal" and ms == 30 * 60 * 1000
    la.arm(rec, kind, jst(2026, 10, 7, 12, 10), Seq(0.5), ms)
    assert rec["agenda"]["meal"] == "午餐"
    assert la.meal_due(rec, jst(2026, 10, 7, 13)) == -1
    assert la.meal_due(rec, jst(2026, 10, 7, 15)) == -1  # 不在時段
    # 夜貓子的晚飯在半夜 00:30
    store, rec = japan_rec("夜貓子", at=jst(2026, 10, 7, 0, 40))
    assert la.meal_due(rec, jst(2026, 10, 8, 0, 40)) == 2
    # 溜達一天最多三次
    store, rec = japan_rec("", at=jst(2026, 10, 7, 15))
    t = jst(2026, 10, 7, 15)
    rec["strollLog"] = [t - la.HOUR_MS, t - 2 * la.HOUR_MS, t - 3 * la.HOUR_MS]
    assert la.choice_weights(rec, t)["stroll"] == 0
    # 在家的事：不各寫記憶，平靜往下壓；睡前併成一行
    store, rec = japan_rec("", "低落", 50, jst(2026, 10, 7, 15))
    n = len(rec["memories"])
    for kind, mins, at in (("idle", 120, jst(2026, 10, 7, 15)), ("tidy", 30, jst(2026, 10, 7, 17))):
        la.arm(rec, kind, at, Seq(0.5), mins * 60000)
        la.quick_step(store, at + mins * 60000, Seq(0.5))
    assert len(rec["memories"]) == n
    assert rec["moodLevel"] < 50 - 8 - 10  # 衰減＋發呆壓 10＋整理壓 14
    assert rec["last"]["text"] == "把住所整理了一下。"
    rec["agenda"] = None
    la.arm(rec, "meal", jst(2026, 10, 7, 19, 10), Seq(0.5))
    la.quick_step(store, rec["agenda"]["until"], Seq(0.5))
    rec["agenda"] = None
    la.arm(rec, "sleep", jst(2026, 10, 8, 0, 30))
    mem = rec["memories"][-1]
    assert mem["kind"] == "home" and "發呆了兩個小時" in mem["text"] and "整理了房間" in mem["text"] and "晚餐" in mem["text"], mem["text"]
    assert rec["homeDay"] == {}
    # 上網：一天第一次才算 firstToday（main 才叫模型、寫記憶）
    store, rec = japan_rec("", at=jst(2026, 10, 7, 10))
    la.arm(rec, "browse", jst(2026, 10, 7, 10), Seq(0.1))
    a = la.prepare_resolve(store, "a", rec["agenda"]["until"], Seq(0.5))
    assert a["event"]["firstToday"] is True
    assert la.settle(store, "a", a["until"], "在住所上網，搜了「猫」。看到X。", a["until"], Seq(0.5), keys=["上網", "猫", "X"], next_kind="browse")
    a2 = la.prepare_resolve(store, "a", rec["agenda"]["until"], Seq(0.5))
    assert a2["event"]["firstToday"] is False
    n = len(rec["memories"])
    assert la.settle(store, "a", a2["until"], "", a2["until"], Seq(0.5), keys=["上網", "天気", "台風"])
    assert len(rec["memories"]) == n and "台風" in rec["homeDay"]["titles"]
    # 一個月：打工大多一天一班、溜達 1～3、在家佔醒著的大半
    import random as _r
    rng = _r.Random(42)
    store, rec = japan_rec("", at=jst(2026, 10, 1, 9))
    hours = {k: 0.0 for k in la.KINDS}
    t = jst(2026, 10, 1, 9)
    end = t + 30 * 24 * la.HOUR_MS
    while t < end:
        la.quick_step(store, t, rng.random)
        gid = la.next_due(store, t)
        if gid:
            a = la.prepare_resolve(store, gid, t, rng.random)
            la.settle(store, gid, a["until"], "", t, rng.random)
        hours[rec["agenda"]["kind"]] += 5 / 60
        t += 5 * 60 * 1000
    awake = sum(v for k, v in hours.items() if k != "sleep")
    home = sum(hours[k] for k in la.HOME_KINDS)
    assert home / awake > 0.5, hours
    assert 3.5 <= hours["work"] / 30 <= 6.0, hours  # 平均 1～1.5 班
    assert hours["stroll"] / 30 <= 2.5, hours


if __name__ == "__main__":
    main()
