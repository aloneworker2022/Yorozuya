"""python tests/rental_lines_test.py — 日租女友 LINE 的 AI 提示詞與解析（server/rental_lines.py）。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import rental_lines as RL  # noqa: E402

PASS = 0


def t(name):
    def deco(fn):
        global PASS
        fn()
        PASS += 1
        print("ok -", name)
    return deco


BASE = {"girl": {"name": "雨彤", "stage": "devoted_wife", "family": "熱絡", "archetype": "活潑開朗"},
        "client": {"name": "佐藤健太", "age": 32, "persona": "炫耀", "regular": False},
        "plan": ["咖啡店", "電影院", "晚餐"]}


@t("客人：當她是經紀人的人、照真相寫；沒有親近動作就明說沒有")
def _():
    s, u = RL.prompt({**BASE, "side": "client", "kind": "spot", "spot": {"place": "咖啡店", "item": "拿鐵", "act": ""}})
    assert "經紀人" in s and "不知道他們是夫妻" in s and "炫耀" in s
    assert "沒有任何親近的動作" in u and "咖啡店" in u
    s2, u2 = RL.prompt({**BASE, "side": "client", "kind": "spot", "spot": {"place": "電影院", "item": "恐怖片", "gift": True,
        "beats": [{"t": "共用爆米花", "ok": True, "lv": 1}, {"t": "電影院黑暗中接吻", "ok": False, "lv": 5}]}})
    assert "她接受了：共用爆米花" in u2 and "她閃開了：電影院黑暗中接吻" in u2 and "買了東西" in u2


@t("她：照誠實度；旅館裡回得很短；回覆帶老公剛傳的話")
def _():
    s, _u = RL.prompt({**BASE, "side": "wife", "kind": "spot", "honesty": "lie", "spot": {"place": "晚餐", "item": "牛排"}})
    assert "說謊" in s and "貼心妻子" in s
    s, u = RL.prompt({**BASE, "side": "wife", "kind": "reply", "phase": "hotel", "text": "你在幹嘛", "hotel": "休息；做愛，他射了 2 次"})
    assert "你在幹嘛" in u and "不方便" in u and "旅館的真相" in u
    s, u = RL.prompt({**BASE, "side": "client", "kind": "reply", "phase": "hotel", "text": "她還好嗎", "recent": ["客人：到了", "經紀人：好"]})
    assert "敷衍" in u and "經紀人：好" in u


@t("解析：去引號、去名字前綴、跳過旁白；太長或禁字回空")
def _():
    assert RL.parse("客人：「她超可愛的啦」") == "她超可愛的啦"
    assert RL.parse("（旁白）\n她：嗯～在吃東西") == "嗯～在吃東西"
    assert RL.parse("老公在嗎～") == "老公在嗎～"
    assert RL.parse("x" * 90) == ""
    assert RL.parse("救命啊") == ""
    assert RL.parse("") == ""


@t("意圖分類：提示詞帶對象與原句；解析鼓勵／勸阻／普通，看不懂回空")
def _():
    s, u = RL.intent_prompt("wife", "放開一點沒關係")
    assert "鼓勵／勸阻／普通" in s and "妻子" in u and "放開一點沒關係" in u
    assert RL.parse_intent("鼓勵") == "encourage" and RL.parse_intent("答：勸阻") == "restrain"
    assert RL.parse_intent("普通。") == "none" and RL.parse_intent("不知道") == ""


print(f"rental_lines: {PASS} passed")
