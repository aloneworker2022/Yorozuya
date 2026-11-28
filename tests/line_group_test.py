"""python tests/line_group_test.py — RP5 名冊群主動發文：間隔、潛水、合不合、稱呼、秘密、排程（睡覺／打工不發、插話）、合併去重"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import line_group as L  # noqa: E402

NOW = 1791100000000
MIN = 60_000
passed = 0


def t(name):
    def deco(fn):
        global passed
        fn()
        passed += 1
        print("ok -", name)
    return deco


def G(gid, arch, stage="friend", pro=50, jea=30, **kw):
    g = {"id": gid, "name": gid, "archetype": arch, "roomStage": stage,
         "stats": {"proactivity": pro, "jealousy": jea}, "hobbies": [], "likes": []}
    g.update(kw)
    return g


def life(**recs):
    return {"girls": {gid: dict({"id": gid, "phase": "japan", "agenda": None, "memories": []}, **r) for gid, r in recs.items()}}


@t("間隔跟手機同一套")
def _():
    assert round(L.base_interval_min(90)) == 30
    assert round(L.base_interval_min(30)) == 240
    assert round(L.base_interval_min(60)) == 85
    assert L.base_interval_min(0) == 360
    assert abs(L.interval_mult(mood="愉快", mood_level=40, hunger=80) - 0.36) < 1e-9
    assert L.interval_mult(mood="低落", mood_level=40) == 1.5


@t("潛水：跟手機的雜湊一樣、約 30%")
def _():
    n = sum(L.lurks_today(f"g{i}", "冷淡", "2026-10-10") for i in range(2000))
    assert 500 < n < 700, n
    assert not L.lurks_today("x", "熱絡", "d")


@t("合不合初始與退回")
def _():
    assert L.seed_affinity(G("a", "活潑開朗"), G("b", "文靜溫柔")) == 20
    assert L.seed_affinity(G("a", "病嬌"), G("b", "病嬌")) == -15
    assert L.seed_affinity(G("a", "病嬌", hobbies=["天文", "貓"]), G("b", "高冷", hobbies=[{"name": "天文"}, "貓"])) == -4
    aff = {}
    a, b = G("a", "病嬌"), G("b", "文靜溫柔")
    L.bump_affinity(aff, a, b, -8, NOW)
    assert L.get_affinity(aff, b, a, NOW) == -28
    assert abs(L.get_affinity(aff, a, b, NOW + 24 * 3600_000) + 24) < 1e-9


@t("稱呼、秘密、長度")
def _():
    assert L.scrub_husband("老公在嗎", "wife") == "老公在嗎"
    assert L.scrub_husband("老公在嗎", "lover", "阿呆") == "阿呆在嗎"
    assert L.scrub_husband("老公在嗎", "friend", "阿呆") == "你在嗎"
    assert L.secret_leak("回家路上被陌生男摸") and not L.secret_leak("剛吃完拉麵")
    g = G("a", "病嬌", stage="girlfriend")
    assert L.accept("美咲：好累\n老公抱抱\n三\n四", g) == ["好累", "你抱抱", "三"]
    assert L.accept("昨天跟店長上床了", g) == []
    assert L.accept("一\n二", G("b", "高冷")) == ["一"]


@t("排程：睡覺、打工、在他房間不發；醒著到期就發")
def _():
    data = {"succubi": [G("a", "活潑開朗", pro=90)], "settings": {}}
    store = L.new_store()
    lf = life(a={"agenda": {"kind": "sleep", "until": NOW + 3600_000}})
    assert L.step(store, data, lf, NOW, random.random) is None
    lf = life(a={"agenda": {"kind": "work", "until": NOW + 3600_000}})
    store["girls"]["a"] = {"nextAt": NOW - MIN, "lastPostAt": 0}
    assert L.step(store, data, lf, NOW, random.random) is None
    assert store["girls"]["a"]["nextAt"] > NOW  # 到期但在打工：重排
    store["girls"]["a"]["nextAt"] = NOW - MIN
    assert L.step(store, data, life(a={"phase": "room"}), NOW) is None
    store["girls"]["a"]["nextAt"] = NOW - MIN
    job = L.step(store, data, life(a={}), NOW)
    assert job and job["kind"] == "post" and job["gid"] == "a"


@t("剛睡醒：5～25 分鐘內排一則早安")
def _():
    data = {"succubi": [G("a", "活潑開朗", pro=30)], "settings": {}}
    store = L.new_store()
    L.step(store, data, life(a={"agenda": {"kind": "sleep", "until": NOW + MIN}}), NOW)
    L.step(store, data, life(a={}), NOW + 2 * MIN)
    nxt = store["girls"]["a"]["nextAt"] - (NOW + 2 * MIN)
    assert 5 * MIN <= nxt <= 25 * MIN, nxt


@t("插話：RP5 發文後每個醒著的群友約一半機率接，最多兩個，有延遲")
def _():
    girls = [G("a", "活潑開朗"), G("b", "文靜溫柔"), G("c", "天然呆"), G("d", "御姊")]
    data = {"succubi": girls, "settings": {}}
    counts = []
    for seed in range(300):
        rnd = random.Random(seed).random
        store = L.new_store()
        L.commit(store, {"kind": "post", "act": "post", "gid": "a"}, girls[0], ["剛下班！"], data, life(), NOW, rnd)
        L.step(store, data, life(), NOW + MIN, rnd)
        q = [j for j in store["queue"] if j["kind"] == "react"]
        assert all(j["at"] > NOW + MIN for j in q)
        assert all(j["gid"] != "a" for j in q)
        counts.append(len(q))
    assert max(counts) == 2 and min(counts) == 0
    avg = sum(counts) / len(counts)
    assert 0.9 < avg < 1.6, avg


@t("插話：睡覺的人不接、玩家那一波（手機寫的）不再接")
def _():
    girls = [G("a", "活潑開朗"), G("b", "文靜溫柔")]
    data = {"succubi": girls, "settings": {}, "lineGroup": {"messages": [
        {"id": "p1", "kind": "girl", "girlId": "a", "name": "a", "text": "嗨", "t": NOW}]}}
    store = L.new_store()
    for s in range(50):
        L.step(store, data, life(), NOW + MIN, random.Random(s).random)
    assert not store["queue"]
    store = L.new_store()
    L.commit(store, {"kind": "post", "act": "post", "gid": "a"}, girls[0], ["嗨"], data, life(), NOW, random.random)
    lf = life(b={"agenda": {"kind": "sleep", "until": NOW + 3600_000}})
    L.step(store, data, lf, NOW + MIN, lambda: 0.0)
    assert not store["queue"]


@t("插話對象：@他的貼文，嫉妒高的妻子宣示主權或酸")
def _():
    girls = [G("a", "活潑開朗", stage="girlfriend"), G("y", "病嬌", stage="wife", jea=98)]
    data = {"succubi": girls, "settings": {}}
    msg = {"id": "m", "kind": "girl", "girlId": "a", "t": NOW, "meta": {"at": "player", "depth": 0}}
    store = L.new_store()
    acts = set()
    for s in range(100):
        for j in L.plan_reactions(msg, data, store, life(), NOW, random.Random(s).random):
            acts.add(j["act"])
    assert acts <= {"claim", "needle"} and acts


@t("一輪只出一件；佇列優先；伺服器停太久不補發")
def _():
    girls = [G("a", "活潑開朗"), G("b", "文靜溫柔")]
    data = {"succubi": girls, "settings": {}}
    store = L.new_store()
    store["girls"] = {"a": {"nextAt": NOW - MIN}, "b": {"nextAt": NOW - 5 * 3600_000}}
    store["queue"] = [{"kind": "react", "gid": "b", "act": "agree", "target": "a", "replyTo": "x", "depth": 1, "at": NOW - 1}]
    job = L.step(store, data, life(), NOW)
    assert job["kind"] == "react"
    assert store["girls"]["b"]["nextAt"] > NOW  # 過期太久：重排
    job = L.step(store, data, life(), NOW)
    assert job["kind"] == "post" and job["gid"] == "a"


@t("合併進存檔：id 去重、照時間排")
def _():
    store = {"feed": [{"id": "s1", "t": 3}, {"id": "s2", "t": 1}]}
    data = {"lineGroup": {"messages": [{"id": "p", "t": 2}, {"id": "s2", "t": 1}]}}
    assert L.merge_into_save(data, store) == 1
    assert [m["id"] for m in data["lineGroup"]["messages"]] == ["s2", "p", "s1"]
    assert L.merge_into_save(data, store) == 0


@t("prompt：秘密記憶不進、妻子飢渴暗示、老公規則")
def _():
    g = G("y", "病嬌", stage="wife", kinks=["露出癖"], playerPet="")
    data = {"succubi": [g, G("a", "活潑開朗")], "settings": {"player": "阿哲"}}
    lf = life(y={"memories": [
        {"at": NOW - MIN, "text": "回家路上跟店長上床了", "private": "affair"},
        {"at": NOW - MIN, "text": "在超市買了布丁"}], "hungerSeen": 90})
    msgs = L.build_prompt({"kind": "post", "gid": "y", "at": "player"}, data, L.new_store(), lf, NOW)
    sys_ = msgs[0]["content"]
    assert "布丁" in sys_ and "店長" not in sys_
    assert "含蓄暗示" in sys_ and "露出癖" in sys_
    assert "老公" in sys_ and "@阿哲" in msgs[1]["content"]



@t("清除（2026-10-14）：手機記 clearedAt，讀存檔合併時不把那之前的 RP5 訊息蓋回去")
def _():
    store = {"feed": [{"id": "a", "t": NOW - 10 * MIN, "kind": "girl"}, {"id": "b", "t": NOW + MIN, "kind": "girl"}]}
    data = {"lineGroup": {"messages": [], "clearedAt": NOW}}
    assert L.merge_into_save(data, store) == 1
    assert [m["id"] for m in data["lineGroup"]["messages"]] == ["b"]
    old = {"lineGroup": {"messages": []}}
    assert L.merge_into_save(old, store) == 2

@t('備用句先替換活動再去重，句庫用完不強迫重播')
def _():
    g=G('a','文靜溫柔')
    texts=['大家今天也辛苦了。','剛打工完，有點累呢。','記得吃飯喔。']
    data={'lineGroup':{'messages':[{'id':str(i),'girlId':'a','text':x,'t':NOW} for i,x in enumerate(texts)]}}
    assert L.canned({'kind':'post','lastKind':'work'},g,store=L.new_store(),data=data,now_ms=NOW)==[]
    assert L.canned({'kind':'post','lastKind':'meal'},g,store=L.new_store(),data=data,now_ms=NOW)==['剛吃飯完，有點累呢。']

@t('模型重複句不發，但仍排下次發文；同批重複只留一次')
def _():
    g=G('a','文靜溫柔');store=L.new_store();data={'succubi':[g]};job={'kind':'post','gid':'a'}
    assert len(L.commit(store,job,g,['今天也要記得吃飯喔。','今天也要記得吃飯喔！'],data,life(),NOW))==1
    assert L.commit(store,job,g,['今天也要記得吃飯喔～'],data,life(),NOW+MIN)==[]
    assert store['girls']['a']['nextAt']>NOW+MIN
    assert store['girls']['a']['lastPostAt']==NOW

@t('群組很熱鬧仍會帶到自己的舊發言；同步同批 id 只加一次')
def _():
    g=G('a','文靜溫柔');data={'succubi':[g,G('b','活潑開朗')],'lineGroup':{'messages':[{'id':'old','girlId':'a','text':'我已經說過這件事','t':NOW-20}]}}
    store=L.new_store();store['feed']=[{'id':f'b{i}','girlId':'b','text':'別人的話','t':NOW+i} for i in range(15)]
    assert '我已經說過這件事' in L.build_prompt({'kind':'post','gid':'a'},data,store,life(),NOW)[0]['content']
    store['feed']=[store['feed'][0],store['feed'][0]]
    assert L.merge_into_save(data,store)==1

print(f"\n{passed} passed")
