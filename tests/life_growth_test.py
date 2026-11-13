"""python tests/life_growth_test.py — 每晚沉澱（life_agent growth）"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import life_agent as la  # noqa: E402
import line_group as lg  # noqa: E402

H = la.HOUR_MS
NOW = 1791100000000


def rec_with(mems):
    rec = la._blank("a")
    rec.update({"name": "小夜", "phase": "japan", "homeId": "x", "homeName": "書店樓上的房間",
                "hobbies": ["天文"], "likes": ["草莓"], "archetype": "傲嬌"})
    rec["memories"] = mems
    return rec


def main():
    mems = [
        {"text": "在住所上網，搜了「星空」。看到流星雨的新聞。", "at": NOW - 5 * H, "kind": "browse"},
        {"text": "在河堤看到穿浴衣的情侶在親熱。", "at": NOW - 3 * H, "kind": "stroll", "private": "ero"},
        {"text": "很久以前的事。", "at": NOW - 60 * H, "kind": "work"},
    ]
    store = {"girls": {"a": rec_with(mems)}}
    rec = store["girls"]["a"]

    # 睡前打旗：一天一次
    assert la.mark_growth_due(rec, NOW)
    assert la.next_growth(store) == "a"
    act = la.prepare_growth(store, "a", NOW)
    assert act and len(act["memories"]) == 2, act  # 太舊的不看
    system, user = la.growth_prompt(act)
    assert "JSON" in system and "1. " in user and "傲嬌" in user and "草莓" in user

    reply = "好的：" + json.dumps([
        {"kind": "interest", "text": "迷上看流星", "why": "上網看到流星雨", "from": [1]},
        {"kind": "attitude", "text": "看到河堤會臉紅", "why": "河堤那件事", "from": [2]},
        {"kind": "nope", "text": "亂寫", "from": [1]},
        {"kind": "habit", "text": "睡前翻星座盤", "why": "x"},  # 沒 from，清單有私事 → 當私事
    ], ensure_ascii=False)
    new = la.parse_growth(reply, act["memories"])
    assert [g["kind"] for g in new] == ["interest", "attitude", "habit"], new
    assert "private" not in new[0] and new[1]["private"] == "ero" and new[2]["private"] == "ero"
    assert la.parse_growth("沒有", act["memories"]) == []
    assert la.parse_growth("[]", act["memories"]) == []

    la.commit_growth(store, "a", new, NOW)
    assert "growthDue" not in rec and rec["growthAt"] == NOW and len(rec["growth"]) == 3
    assert not la.mark_growth_due(rec, NOW + 2 * H)  # 午睡不算
    assert la.mark_growth_due(rec, NOW + 20 * H)

    # 第二晚：流星又出現 → 加強；其他淡一次
    day2 = NOW + 24 * H
    la.commit_growth(store, "a", [{"kind": "interest", "text": "越來越迷看流星", "why": "又查了流星"}], day2)
    star = next(g for g in rec["growth"] if g["kind"] == "interest")
    assert abs(star["weight"] - 1.8) < 1e-6 and star["times"] == 2 and star["text"] == "越來越迷看流星", star
    other = next(g for g in rec["growth"] if g["kind"] == "attitude")
    assert abs(other["weight"] - 0.8) < 1e-6
    assert rec["growth"][0]["kind"] == "interest"  # 分數高的排前面

    # 沒再加強的大約 6 晚後拿掉；加強過的留比較久
    for i in range(5):
        la.commit_growth(store, "a", [], day2 + (i + 1) * 24 * H)
    kinds = [g["kind"] for g in rec["growth"]]
    assert "attitude" not in kinds and "interest" in kinds, rec["growth"]

    # 上限 8 條
    many = [{"kind": "habit", "text": f"習慣{i}號{'甲乙丙丁戊己庚辛壬癸'[i]}", "why": ""} for i in range(10)]
    merged = la.merge_growth([], many, NOW)
    assert len(merged) == la.GROWTH_CAP

    # 沒新經歷：不叫模型，只淡一次、清旗
    s2 = {"girls": {"b": rec_with([])}}
    s2["girls"]["b"]["growth"] = [{"kind": "habit", "text": "早起散步", "weight": 1.0, "at": NOW}]
    la.mark_growth_due(s2["girls"]["b"], NOW)
    assert la.prepare_growth(s2, "b", NOW) is None
    assert "growthDue" not in s2["girls"]["b"] and abs(s2["girls"]["b"]["growth"][0]["weight"] - 0.8) < 1e-6

    # 同步到手機 world.growth
    girl = {"id": "a", "world": {}}
    la._paint_world(girl, la.view_of(rec))
    assert girl["world"]["growth"] == rec["growth"]

    # 睡覺排 3 小時以上才打旗
    r3 = rec_with([])
    la.arm(r3, "sleep", NOW, ms=6 * H)
    assert la._ms(r3.get("growthDue")) == NOW

    # LINE（伺服器發文）：私事來的不進群
    r4 = rec_with([])
    r4["growth"] = [{"kind": "interest", "text": "迷上看流星", "weight": 1}, {"kind": "attitude", "text": "看到河堤會臉紅", "private": "ero", "weight": 1}]
    bits = "\n".join(lg.life_bits(r4, NOW))
    assert "迷上看流星" in bits and "河堤" not in bits, bits
    print("life_growth ok")


if __name__ == "__main__":
    main()
