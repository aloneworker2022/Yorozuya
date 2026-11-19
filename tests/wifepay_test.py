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
    nar = (
        "暖黃燈下，她仰躺在凌亂的床單上，眉心微蹙、唇瓣微張，眼尾含著水光卻還是看著壓上來的男人；"
        "他額角沁著汗，眼神發亮、嘴角帶著得意，腰一下一下深深頂進去，床板跟著輕輕響。"
    )
    ok = W.parse_dialog(
        f"旁白：{nar}\n"
        "男：夾這麼緊。\n"
        "她：嗯……慢一點……\n"
    )
    assert ok == {
        "narration": nar,
        "man": "夾這麼緊。",
        "wife": "嗯……慢一點……",
    }
    # 別名＋旁白跨行接起來
    alt_nar = (
        "他們面對面坐著緊緊抱在一起，她閉著眼、耳根發燙，手指抓著他的背；"
        "男人吻得很深，手沿著她的腰慢慢磨，眼神裡帶著貪戀，呼吸都交纏在一塊。"
    )
    alt = W.parse_dialog(
        "敘述：" + alt_nar[:30] + "\n" + alt_nar[30:] + "\n"
        "客人：叫出來。\n老婆：啊……好深……"
    )
    assert alt and alt["man"] == "叫出來。" and alt["narration"] == alt_nar
    # 缺一段 → None
    assert W.parse_dialog("旁白：只有旁白。\n男：只有男。") is None
    # 旁白太短（不到 NAR_MIN）→ None
    short = W.parse_dialog("旁白：門後傳來喘息。\n男：再夾緊。\n她：嗯啊……")
    assert short is None
    # BANNED 清掉該句 → 缺段 → None
    bad = W.parse_dialog(f"旁白：{nar}\n男：放開我救命。\n她：嗯……")
    assert bad is None
    assert W.apply_banned("未成年不可以") == ""
    assert W.apply_banned("慢一點……") == "慢一點……"
    parsed, ai = W.resolve_dialog("這不是規定格式", {"pose": "kiss"})
    assert ai is False
    assert parsed["narration"] and parsed["man"] and parsed["wife"]
    assert W.NAR_MIN <= len(parsed["narration"]) <= W.NAR_MAX
    parsed2, ai2 = W.resolve_dialog(f"旁白：{nar}\n男：再夾緊。\n她：嗯啊……", {})
    assert ai2 is True and parsed2["wife"].startswith("嗯")


def test_fallback_not_banned():
    for pose in ("missionary", "cowgirl", "doggy", "kiss", "reverse", ""):
        row = W.fallback_dialog({"pose": pose}, rnd=lambda: 0.0)
        for k in ("narration", "man", "wife"):
            assert row[k]
            assert W.apply_banned(row[k]) == row[k]
        assert W.NAR_MIN <= len(row["narration"]) <= W.NAR_MAX
        assert len(row["narration"]) > len(row["man"])
        assert any(w in row["narration"] for w in ("眉", "眼", "表情", "嘴角", "臉", "耳根", "喘"))


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
    assert "表情" in sys and "60" in sys and "120" in sys
    assert "60～120" in user
    # 旁白提示不該再把整段寫成「從門外聽到的對話」，也不該把說明塞進輸出格式裡
    assert "聽到的對話" not in sys
    assert "第三人稱" in sys
    assert "肢體" in sys
    assert "不要把" in user or "寫進旁白" in sys or "寫進旁白" in user
    # 沒選劇本時不要留下空的「劇本：」列
    assert not user.startswith("劇本：")
    sc = W.STOCK_SCRIPTS[1]
    sys2, user2 = W.dialog_messages(
        {"name": "小焰", "pose": "cowgirl", "build": "slim", "stage": "wife"},
        script=sc,
    )
    assert sc["name"] in user2
    assert "騎乘" in user2 or "跨坐" in user2
    assert "{scenario}" not in user2 and "{script_name}" not in user2 and "{name}" not in user2


def test_migrate_old_dialog_default():
    assets = _assets()
    p = W.dialog_path(assets)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(W.OLD_DIALOG, ensure_ascii=False, indent=2), encoding="utf-8")
    d = W.load_dialog_prompt(assets)
    assert d["system"] == W.DEFAULT_DIALOG["system"]
    assert d["user"] == W.DEFAULT_DIALOG["user"]
    saved = json.loads(p.read_text("utf-8"))
    assert saved["system"] == W.DEFAULT_DIALOG["system"]
    # 上一版「聽到的對話」預設也要遷
    assets_prev = _assets()
    pp = W.dialog_path(assets_prev)
    pp.parent.mkdir(parents=True, exist_ok=True)
    pp.write_text(json.dumps(W.PREV_DIALOG, ensure_ascii=False, indent=2), encoding="utf-8")
    d2 = W.load_dialog_prompt(assets_prev)
    assert d2["system"] == W.DEFAULT_DIALOG["system"]
    # 使用者自訂的模板不能被蓋掉
    assets2 = _assets()
    custom = {"system": "我自己寫的系統提示", "user": "使用者 {name}"}
    W.save_dialog_prompt(assets2, custom)
    again = W.load_dialog_prompt(assets2)
    assert again["system"] == "我自己寫的系統提示"
    assert again["user"] == "使用者 {name}"


def test_scripts_crud_and_pick():
    assets = _assets()
    scripts = W.load_scripts(assets)
    assert len(scripts) >= 8
    ids = {s["id"] for s in scripts}
    assert "sc_cowgirl" in ids and "sc_intense" in ids
    # 每個內建劇本都有可用的後備旁白
    for s in scripts:
        fb = W.clean_fallback(s.get("fallback"))
        assert fb, s["id"]
        assert W.apply_banned(fb["narration"]) == fb["narration"]
    # 指定 id
    hit = W.pick_script(scripts, script_id="sc_kiss")
    assert hit and hit["id"] == "sc_kiss"
    # tags 優先
    tagged = W.pick_script(scripts, tags=["doggy"], rnd=__import__("random").Random(0))
    assert "doggy" in (tagged.get("tags") or [])
    # CRUD
    added = W.add_script(assets, {"name": "測試本", "scenario": "只是測試情境。", "tags": ["kiss"]})
    assert added["id"].startswith("sc_")
    assert W.get_script(assets, added["id"])["name"] == "測試本"
    patched = W.patch_script(assets, added["id"], {"name": "測試本乙", "enabled": False})
    assert patched["name"] == "測試本乙" and patched["enabled"] is False
    assert W.delete_script(assets, added["id"]) is True
    assert W.get_script(assets, added["id"]) is None
    # 不能刪到一個都不剩
    only = W.load_scripts(assets)
    last = only[0]
    for s in only[1:]:
        assert W.delete_script(assets, s["id"]) is True
    assert W.delete_script(assets, last["id"]) is False
    assert len(W.load_scripts(assets)) == 1
    # 自訂 dialog.json 會變成第一個劇本，原文保留
    assets2 = _assets()
    W.save_dialog_prompt(assets2, {"system": "我自己寫的系統提示", "user": "使用者 {name} 加 {scenario}"})
    seeded = W.load_scripts(assets2)
    assert seeded[0]["name"] == "自訂模板"
    assert seeded[0]["system"] == "我自己寫的系統提示"
    assert "使用者 {name}" in seeded[0]["user"]
    # 劇本後備優先於體位後備
    row = W.fallback_dialog({"pose": "missionary", "script": hit}, rnd=lambda: 0.0)
    assert row["narration"] == hit["fallback"]["narration"]


if __name__ == "__main__":
    test_gallery_crud()
    test_dialog_prompt_save()
    test_expand_and_vars()
    test_parse_and_banned()
    test_fallback_not_banned()
    test_pick_one_or_two()
    test_dialog_messages_expand()
    test_migrate_old_dialog_default()
    test_scripts_crud_and_pick()
    print("wifepay_test: ok")
