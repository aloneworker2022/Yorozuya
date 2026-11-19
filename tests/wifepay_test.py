"""python tests/wifepay_test.py — 老婆還債圖庫 CRUD、對話解析／後備／BANNED、隨機抽 1～2 張。"""
import json
import random
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import wifepay as W  # noqa: E402

# 1×1 PNG
PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _assets():
    return Path(tempfile.mkdtemp(prefix="wifepay-"))


def test_gallery_crud():
    assets = _assets()
    assert W.load_index(assets) == []
    a = W.add_item(assets, PNG, width=8, height=12, prompt="hello {name}", tags=["cowgirl", "bed"])
    assert a["id"].startswith("wp_")
    assert a["url"].startswith(W.GALLERY_PREFIX)
    assert a["denoise"] == W.DEFAULT_DENOISE
    assert (W.gallery_dir(assets) / a["file"]).is_file()
    b = W.add_item(assets, PNG, denoise=0.7, tags=["doggy"])
    listed = W.load_index(assets)
    assert len(listed) == 2
    got = W.get_item(assets, a["id"])
    assert got and got["prompt"].startswith("hello")
    patched = W.patch_item(assets, a["id"], {"prompt": "p2 {hair}", "denoise": 0.2, "tags": ["missionary"]})
    assert patched["prompt"] == "p2 {hair}"
    assert patched["denoise"] == W.DENOISE_LO  # 0.2 → clamp 0.35
    assert patched["tags"] == ["missionary"]
    assert W.delete_item(assets, a["id"]) is True
    assert W.get_item(assets, a["id"]) is None
    assert not (W.gallery_dir(assets) / a["file"]).is_file()
    assert len(W.load_index(assets)) == 1
    assert W.delete_item(assets, "nope") is False
    assert W.get_item(assets, b["id"])["id"] == b["id"]


def test_dialog_prompt_save():
    assets = _assets()
    d = W.load_dialog_prompt(assets)
    assert "旁白" in d["system"] and "{pose_zh}" in d["user"]
    saved = W.save_dialog_prompt(assets, {"system": "系統X", "user": "使用者 {name}"})
    assert saved["system"] == "系統X"
    again = W.load_dialog_prompt(assets)
    assert again["user"] == "使用者 {name}"


def test_expand_and_vars():
    info = {
        "name": "小焰",
        "pose": "cowgirl",
        "build": "fat",
        "family": "反差",
        "voice": "gasp",
        "stage": "devoted_wife",
        "character": {"look": {"hair": "長黑髮", "bust": "E 罩杯", "body": "纖細"}},
    }
    v = W.persona_vars(info)
    assert v["name"] == "小焰"
    assert v["pose_zh"]
    assert "胖" in v["man_build_zh"] or "肚子" in v["man_build_zh"]
    assert v["stage_zh"]
    assert v["breasts"] == "E 罩杯"
    text = W.expand("她是{name}，{breasts}，體位{pose}", v)
    assert text == "她是小焰，E 罩杯，體位cowgirl"
    assert W.expand("沒有{missing}鍵", v) == "沒有鍵"


def test_parse_and_banned():
    ok = W.parse_dialog(
        "旁白：她被壓在床上一下一下地頂著。\n"
        "男：夾這麼緊。\n"
        "她：嗯……慢一點……\n"
    )
    assert ok == {
        "narration": "她被壓在床上一下一下地頂著。",
        "man": "夾這麼緊。",
        "wife": "嗯……慢一點……",
    }
    # 別名
    alt = W.parse_dialog("敘述：他們抱在一起。\n客人：叫出來。\n老婆：啊……好深……")
    assert alt and alt["man"] == "叫出來。"
    # 缺一段 → None
    assert W.parse_dialog("旁白：只有旁白。\n男：只有男。") is None
    # BANNED 清掉該句 → 缺段 → None
    bad = W.parse_dialog("旁白：她被壓著。\n男：放開我救命。\n她：嗯……")
    assert bad is None
    assert W.apply_banned("未成年不可以") == ""
    assert W.apply_banned("慢一點……") == "慢一點……"
    parsed, ai = W.resolve_dialog("這不是規定格式", {"pose": "kiss"})
    assert ai is False
    assert parsed["narration"] and parsed["man"] and parsed["wife"]
    parsed2, ai2 = W.resolve_dialog("旁白：門後傳來喘息。\n男：再夾緊。\n她：嗯啊……", {})
    assert ai2 is True and parsed2["wife"].startswith("嗯")


def test_fallback_not_banned():
    for pose in ("missionary", "cowgirl", "doggy", "kiss", "reverse", ""):
        row = W.fallback_dialog({"pose": pose}, rnd=lambda: 0.0)
        for k in ("narration", "man", "wife"):
            assert row[k]
            assert W.apply_banned(row[k]) == row[k]


def test_pick_one_or_two():
    items = [
        {"id": "a", "url": "/assets/wifepay/gallery/a.png", "tags": ["cowgirl"]},
        {"id": "b", "url": "/assets/wifepay/gallery/b.png", "tags": ["doggy"]},
        {"id": "c", "url": "/assets/wifepay/gallery/c.png", "tags": ["cowgirl"]},
    ]
    assert W.pick_items([], count=2) == []
    one = W.pick_items(items, count=1, rnd=random.Random(1))
    assert len(one) == 1 and one[0]["id"] in ("a", "b", "c")
    two = W.pick_items(items, count=2, rnd=random.Random(2))
    assert len(two) == 2 and len({x["id"] for x in two}) == 2
    # 只有一張時，就算要 2 張也只回 1
    assert len(W.pick_items(items[:1], count=2)) == 1
    # 對上 pose 的 tags 優先
    tagged = W.pick_items(items, pose="cowgirl", count=2, rnd=random.Random(0))
    assert {x["id"] for x in tagged} == {"a", "c"}
    # 隨機 1 或 2（固定種子）
    counts = {W.pick_count(random.Random(i).random) for i in range(20)}
    assert counts == {1, 2}
    # 空圖庫
    assert W.pick_items(None) == []


def test_dialog_messages_expand():
    sys, user = W.dialog_messages({"name": "小焰", "pose": "doggy", "build": "slim", "stage": "wife"})
    assert "小焰" in user or "老婆" in user
    assert "老漢" in user or "後面" in user


if __name__ == "__main__":
    test_gallery_crud()
    test_dialog_prompt_save()
    test_expand_and_vars()
    test_parse_and_banned()
    test_fallback_not_banned()
    test_pick_one_or_two()
    test_dialog_messages_expand()
    print("wifepay_test: ok")
