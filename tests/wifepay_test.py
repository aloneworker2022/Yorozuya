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
    # 只從該姿勢已選的抽，兩張都對上就兩張
    tagged = W.pick_items(items, pose="cowgirl", count=2, rnd=random.Random(0))
    assert {x["id"] for x in tagged} == {"a", "c"}
    # 只選了 1 張時，就算要 2 張也不從其他姿勢補
    only = W.pick_items(items, pose="doggy", count=2, rnd=random.Random(0))
    assert [x["id"] for x in only] == ["b"]
    # 這個姿勢沒選任何圖 → 空
    assert W.pick_items(items, pose="missionary", count=2) == []
    # 已選超過 2 張時，一次最多抽 2 張，但會從全部已選的裡面抽（含第 3 張）
    extra = items + [{"id": "d", "url": "/assets/wifepay/gallery/d.png", "tags": ["cowgirl"]}]
    capped = W.pick_items(extra, pose="cowgirl", count=2, rnd=random.Random(0))
    assert len(capped) == 2
    assert {x["id"] for x in capped} <= {"a", "c", "d"}
    seen = set()
    for i in range(80):
        seen |= {x["id"] for x in W.pick_items(extra, pose="cowgirl", count=2, rnd=random.Random(i))}
    assert seen == {"a", "c", "d"}
    # 已選 2 張時，未指定 count 會隨機 1 或 2
    counts = {len(W.pick_items(items, pose="cowgirl", rnd=random.Random(i))) for i in range(40)}
    assert counts == {1, 2}
    # 隨機 1 或 2（固定種子）
    raw_counts = {W.pick_count(random.Random(i).random) for i in range(20)}
    assert raw_counts == {1, 2}
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
    # 加入吟叫前的那一版預設也要遷
    assets_prev2 = _assets()
    pp2 = W.dialog_path(assets_prev2)
    pp2.parent.mkdir(parents=True, exist_ok=True)
    pp2.write_text(json.dumps(W.PREV2_DIALOG, ensure_ascii=False, indent=2), encoding="utf-8")
    d3 = W.load_dialog_prompt(assets_prev2)
    assert d3["system"] == W.DEFAULT_DIALOG["system"]
    assert "吟叫" in d3["system"]
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
    for nid in ("sc_reluctant_pleasure", "sc_comes_around", "sc_shy", "sc_hard_start", "sc_falls_for_him"):
        assert nid in ids
    # 每個內建劇本都有可用的後備旁白
    for s in scripts:
        fb = W.clean_fallback(s.get("fallback"))
        assert fb, s["id"]
        assert W.apply_banned(fb["narration"]) == fb["narration"]
        assert W.apply_banned(fb["man"]) == fb["man"]
        assert W.apply_banned(fb["wife"]) == fb["wife"]
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

NEW_STOCK_IDS = (
    "sc_reluctant_pleasure",
    "sc_comes_around",
    "sc_shy",
    "sc_hard_start",
    "sc_falls_for_him",
)
NEW_STOCK_NAMES = ("不太情願卻很舒服", "被幹到迎合", "害羞", "男子一來就猛幹", "幹到愛上")


def test_scripts_seed_and_merge():
    # 缺檔：從程式碼種子，不依賴被 gitignore 的 assets/wifepay/scripts.json
    assets = _assets()
    assert not W.scripts_path(assets).is_file()
    seeded = W.load_scripts(assets)
    ids = [s["id"] for s in seeded]
    assert len(seeded) == len(W.STOCK_SCRIPTS)
    assert set(ids) == W.stock_script_ids()
    for nid, nname in zip(NEW_STOCK_IDS, NEW_STOCK_NAMES):
        hit = next(s for s in seeded if s["id"] == nid)
        assert hit["name"] == nname
        assert hit["scenario"]
        assert hit["man_tone"] and hit["wife_tone"]
        fb = W.clean_fallback(hit["fallback"])
        assert fb and W.NAR_MIN <= len(fb["narration"]) <= 120
        sys_m, user_m = W.dialog_messages({"name": "小焰"}, script=hit)
        assert "男子語氣：" in user_m and hit["man_tone"] in user_m
        assert "妻子語氣：" in user_m and hit["wife_tone"] in user_m
        # 必須是自願：後備對白與情境通過 BANNED；求救詞不能出現
        blob = hit["scenario"] + hit["man_tone"] + hit["wife_tone"] + fb["narration"] + fb["man"] + fb["wife"]
        assert W.apply_banned(blob) == blob
        for bad in ("救命", "報警", "放開我", "強暴", "強姦"):
            assert bad not in blob
        # 後備對白本身不要出現強迫／威脅（情境裡寫「沒有被強迫／不要威脅」是指引）
        spoken = fb["narration"] + fb["man"] + fb["wife"]
        assert "強迫" not in spoken and "威脅" not in spoken
    saved = json.loads(W.scripts_path(assets).read_text("utf-8"))
    assert "seen_stock_ids" in saved and set(saved["seen_stock_ids"]) >= W.stock_script_ids()

    # 舊檔只有部分劇本、使用者改過其中一本：依 id 補新的，不覆蓋改過的
    assets2 = _assets()
    W.scripts_path(assets2).parent.mkdir(parents=True, exist_ok=True)
    custom_old = {
        "id": "sc_cowgirl",
        "name": "我改過的自己動",
        "enabled": True,
        "tags": ["cowgirl"],
        "scenario": "這是使用者自己改的情境，不要被覆蓋。",
        "fallback": W.STOCK_SCRIPTS[1]["fallback"],
    }
    only = {
        "scripts": [
            custom_old,
            {"id": "sc_user", "name": "自訂一本", "scenario": "使用者新增的劇本。", "enabled": True,
             "fallback": W.STOCK_SCRIPTS[0]["fallback"]},
        ]
    }
    W.scripts_path(assets2).write_text(json.dumps(only, ensure_ascii=False, indent=2), encoding="utf-8")
    merged = W.load_scripts(assets2)
    by = {s["id"]: s for s in merged}
    assert by["sc_cowgirl"]["name"] == "我改過的自己動"
    assert by["sc_cowgirl"]["scenario"].startswith("這是使用者自己改")
    assert by["sc_user"]["name"] == "自訂一本"
    for nid in NEW_STOCK_IDS:
        assert nid in by and by[nid]["name"] == NEW_STOCK_NAMES[NEW_STOCK_IDS.index(nid)]
    assert "sc_missionary" in by  # 舊內建缺的也要補

    # 已看過並刪掉的內建不要復活
    assets3 = _assets()
    W.load_scripts(assets3)
    assert W.delete_script(assets3, "sc_shy") is True
    again = W.load_scripts(assets3)
    assert "sc_shy" not in {s["id"] for s in again}
    blob = json.loads(W.scripts_path(assets3).read_text("utf-8"))
    assert "sc_shy" in blob["seen_stock_ids"]

    # 壞檔／空檔要重新種子
    assets4 = _assets()
    p4 = W.scripts_path(assets4)
    p4.parent.mkdir(parents=True, exist_ok=True)
    p4.write_text("{not json", encoding="utf-8")
    assert {s["id"] for s in W.load_scripts(assets4)} == W.stock_script_ids()
    p4.write_text(json.dumps({"scripts": []}, ensure_ascii=False), encoding="utf-8")
    assert {s["id"] for s in W.load_scripts(assets4)} == W.stock_script_ids()



def test_config_char_sec_persist():
    assets = _assets()
    cfg = W.load_config(assets)
    assert cfg["char_sec"] == W.CHAR_SEC_DEFAULT == 0.9
    assert cfg["poses"] == []
    # 缺檔時從程式預設，不依賴被 gitignore 的 config.json
    assert not W.config_path(assets).is_file()
    saved = W.save_config(assets, {"char_sec": 0.9, "poses": ["standing", "standing", "missionary"]})
    assert saved["char_sec"] == 0.9
    assert saved["poses"] == ["standing", "missionary"]
    again = W.load_config(assets)
    assert again["char_sec"] == 0.9 and again["poses"] == ["standing", "missionary"]
    # clamp（0 或無效會回到新預設 0.9）
    assert W.save_config(assets, {"char_sec": 0})["char_sec"] == W.CHAR_SEC_DEFAULT
    assert W.save_config(assets, {"char_sec": 9})["char_sec"] == W.CHAR_SEC_HI
    assert W.save_config(assets, {"char_sec": 0.01})["char_sec"] == W.CHAR_SEC_LO
    # 使用者改過的其他值不要被蓋掉
    assert W.save_config(assets, {"char_sec": 0.5})["char_sec"] == 0.5
    assert W.load_config(assets)["char_sec"] == 0.5
    assert W.save_config(assets, {"char_sec": 1.0})["char_sec"] == 1.0
    assert W.load_config(assets)["char_sec"] == 1.0
    # 檔裡還是舊預設 1.2 時，遷到 0.9，姿勢保留
    path = W.config_path(assets)
    path.write_text(json.dumps({"char_sec": 1.2, "poses": ["standing"]}, ensure_ascii=False), encoding="utf-8")
    migrated = W.load_config(assets)
    assert migrated["char_sec"] == 0.9 and migrated["poses"] == ["standing"]
    stored = json.loads(path.read_text("utf-8"))
    assert stored["char_sec"] == 0.9 and stored["poses"] == ["standing"]
    assert stored["global_prompt"] == W.GLOBAL_POS_DEFAULT
    assert stored["global_negative"] == W.GLOBAL_NEG_DEFAULT
    # 標點等待按比例放大
    assert W.type_delay_ms("字", 0.9) == 900
    assert W.type_delay_ms("，", 0.9) == int(round(900 * (50 / 26)))
    assert W.type_delay_ms("。", 0.9) == int(round(900 * (90 / 26)))
    assert W.type_delay_ms("字", 0.05) == 50
    poses = W.list_poses(assets, ["bed", "cowgirl"])
    ids = [p["id"] for p in poses]
    assert ids[0] == "missionary" and "cowgirl" in ids and "standing" in ids and "bed" in ids
    assert next(p for p in poses if p["id"] == "missionary")["builtin"] is True
    assert next(p for p in poses if p["id"] == "standing")["builtin"] is False


def test_pick_peek_side_consistency():
    rnd = random.Random(7)
    one = W.pick_peek(1, rnd=rnd)
    assert one["side"] in ("left", "right")
    assert one["fracs"] == [W._normalize_frac(one["fracs"][0])]
    assert one["fracs"][0] in W.PEEK_FRACS
    # 兩張：同一邊，比例可不同
    sides, frac_pairs = set(), []
    for seed in range(80):
        row = W.pick_peek(2, rnd=random.Random(seed))
        assert row["side"] in ("left", "right")
        assert len(row["fracs"]) == 2
        assert all(f in W.PEEK_FRACS for f in row["fracs"])
        sides.add(row["side"])
        frac_pairs.append(tuple(row["fracs"]))
    assert sides == {"left", "right"}
    assert any(a != b for a, b in frac_pairs)
    # 指定邊與比例時沿用
    fixed = W.pick_peek(2, side="right", fracs=["3/5", "1/2"], rnd=random.Random(0))
    assert fixed == {"side": "right", "fracs": ["3/5", "1/2"]}
    # 第二張沒指定時跟第一張同一邊
    mixed = W.pick_peek(2, side="left", fracs=["3/5"], rnd=random.Random(1))
    assert mixed["side"] == "left"
    assert mixed["fracs"][0] == "3/5"
    assert mixed["fracs"][1] in W.PEEK_FRACS


def test_global_prompts_compose_and_config():
    assets = _assets()
    cfg = W.load_config(assets)
    assert cfg["global_prompt"] == W.GLOBAL_POS_DEFAULT
    assert cfg["global_negative"] == W.GLOBAL_NEG_DEFAULT
    assert "wide angle" in cfg["global_prompt"] and "third-person view" in cfg["global_prompt"]
    assert "looking at the man" in cfg["global_prompt"] and "eye contact with man" in cfg["global_prompt"]
    assert "first-person view" in cfg["global_negative"] and "solo" in cfg["global_negative"]
    assert "looking at viewer" in cfg["global_negative"] and "looking at camera" in cfg["global_negative"]
    # 不分大小寫去重，保留第一次的寫法，後段接在後面
    assert W.merge_prompt_tags("Wide Angle, 1girl", "wide angle, 1boy, 1girl") == "Wide Angle, 1girl, 1boy"
    composed = W.compose_gen_prompts(
        cfg, W.DEFAULT_ITEM_PROMPT, "",
        {"hair": "black hair", "breasts": "large breasts", "body": "slim", "pose": "cowgirl"},
    )
    assert composed["positive"].startswith(W.GLOBAL_POS_DEFAULT)
    tags = [x.strip().lower() for x in composed["positive"].split(",")]
    assert tags.count("1girl") == 1 and tags.count("1boy") == 1
    assert "cowgirl pose" in composed["positive"] and "black hair" in composed["positive"]
    neg = composed["negative"].lower()
    for w in ("pov", "first-person view", "male pov", "close-up", "cropped", "out of frame", "solo",
              "looking at viewer", "looking at camera", "eye contact with viewer", "child", "loli"):
        assert w in neg
    for w in ("looking at viewer", "looking at camera", "eye contact with viewer"):
        assert w not in composed["positive"].lower()
        assert w not in composed["lead"].lower()
        assert w not in composed["extra"].lower()
    assert "looking at the man" in composed["positive"]
    assert composed["lead"] == W.GLOBAL_POS_DEFAULT
    assert composed["extra"].startswith("1girl, 1boy")
    # 存自訂預設；之後只改打字速度時不要蓋掉
    saved = W.save_config(assets, {"global_prompt": "wide angle, two people", "global_negative": "pov, solo"})
    assert saved["global_prompt"] == "wide angle, two people"
    assert saved["global_negative"] == "pov, solo"
    again = W.save_config(assets, {"char_sec": 0.5, "poses": ["standing"]})
    assert again["char_sec"] == 0.5 and again["poses"] == ["standing"]
    assert again["global_prompt"] == "wide angle, two people"
    assert again["global_negative"] == "pov, solo"
    # 存空字串回到程式預設
    restored = W.save_config(assets, {"global_prompt": "  ", "global_negative": ""})
    assert restored["global_prompt"] == W.GLOBAL_POS_DEFAULT
    assert restored["global_negative"] == W.GLOBAL_NEG_DEFAULT
    # 遷 1.2 秒時保留使用者改過的預設提示詞，只補缺的視線標籤
    path = W.config_path(assets)
    path.write_text(json.dumps({
        "char_sec": 1.2, "poses": ["doggy"],
        "global_prompt": "wide shot only", "global_negative": "pov",
    }, ensure_ascii=False), encoding="utf-8")
    migrated = W.load_config(assets)
    assert migrated["char_sec"] == 0.9 and migrated["poses"] == ["doggy"]
    assert migrated["global_prompt"] == "wide shot only, " + ", ".join(W.LOOK_POS_TAGS)
    assert migrated["global_negative"] == "pov, " + ", ".join(W.LOOK_NEG_TAGS)
    stored = json.loads(path.read_text("utf-8"))
    assert stored["char_sec"] == 0.9
    assert stored["global_prompt"] == migrated["global_prompt"]


def test_global_gaze_migration():
    assets = _assets()
    W.ensure_dirs(assets)
    path = W.config_path(assets)
    # 舊預設 → 新預設
    path.write_text(json.dumps({
        "global_prompt": W.PREV_GLOBAL_POS_DEFAULT,
        "global_negative": W.PREV_GLOBAL_NEG_DEFAULT,
    }, ensure_ascii=False), encoding="utf-8")
    got = W.load_config(assets)
    assert got["global_prompt"] == W.GLOBAL_POS_DEFAULT
    assert got["global_negative"] == W.GLOBAL_NEG_DEFAULT
    stored = json.loads(path.read_text("utf-8"))
    assert stored["global_prompt"] == W.GLOBAL_POS_DEFAULT
    assert stored["global_negative"] == W.GLOBAL_NEG_DEFAULT
    # 自訂：只補缺的，不覆蓋已有
    path.write_text(json.dumps({
        "global_prompt": "wide shot only, looking at the man",
        "global_negative": "pov, looking at viewer",
    }, ensure_ascii=False), encoding="utf-8")
    got = W.load_config(assets)
    assert got["global_prompt"] == "wide shot only, looking at the man, looking at another, eye contact with man"
    assert got["global_negative"] == "pov, looking at viewer, looking at camera, eye contact with viewer"
    # 正向若寫了 looking at viewer，合併時拔掉
    dirty = W.compose_gen_prompts(
        {"global_prompt": "wide angle, looking at viewer, 1girl", "global_negative": W.GLOBAL_NEG_DEFAULT},
        "looking at camera, cowgirl pose", "",
        {},
    )
    low = dirty["positive"].lower()
    assert "looking at viewer" not in low and "looking at camera" not in low
    assert "eye contact with viewer" not in low
    assert "looking at viewer" in dirty["negative"].lower()
    # 已經是新預設，不再改寫
    path.write_text(json.dumps({
        "global_prompt": W.GLOBAL_POS_DEFAULT,
        "global_negative": W.GLOBAL_NEG_DEFAULT,
        "char_sec": 0.9,
    }, ensure_ascii=False), encoding="utf-8")
    again = W.load_config(assets)
    assert again["global_prompt"] == W.GLOBAL_POS_DEFAULT
    assert again["global_negative"] == W.GLOBAL_NEG_DEFAULT
    assert again["gaze_prompt_ver"] == W.GAZE_PROMPT_VER
    # 已遷過的檔，使用者若拿掉視線標籤就不再塞回去
    path.write_text(json.dumps({
        "global_prompt": "wide angle only",
        "global_negative": "pov",
        "gaze_prompt_ver": W.GAZE_PROMPT_VER,
    }, ensure_ascii=False), encoding="utf-8")
    kept = W.load_config(assets)
    assert kept["global_prompt"] == "wide angle only"
    assert kept["global_negative"] == "pov"


def test_img2img_workflow_passes_negative():
    import comfy
    wf = comfy.build_img2img_workflow(
        ckpt="x.safetensors",
        positive="wide angle, 1girl, 1boy",
        negative="pov, first-person view, male pov, solo",
        image_name="ref.png",
    )
    assert wf["3"]["class_type"] == "CLIPTextEncode"
    assert wf["3"]["inputs"]["text"] == "pov, first-person view, male pov, solo"
    assert wf["5"]["class_type"] == "KSampler"
    assert wf["5"]["inputs"]["negative"] == ["3", 0]
    assert wf["2"]["inputs"]["text"] == "wide angle, 1girl, 1boy"


def test_hear_through_door():
    src = "你怎麼可以射進去"
    # 旁白不變
    nar = "暖黃燈下，她仰躺在凌亂的床單上，眉心微蹙、唇瓣微張，眼尾含著水光卻還是看著壓上來的男人；他額角沁著汗，眼神發亮、嘴角帶著得意，腰一下一下深深頂進去，床板跟著輕輕響。"
    row = W.hear_dialog({"narration": nar, "man": "夾這麼緊……錢花得真值。", "wife": src}, enabled=True, level="mid", seed=7)
    assert row["narration"] == nar
    assert row["narration_orig"] == nar
    assert row["man"] and row["wife"]
    assert row["wife_orig"] == src
    # 關掉就原樣
    raw = W.hear_through_door(src, side="wife", level="heavy", seed=3, enabled=False)
    assert raw == src
    # 同一顆種子同一句，結果固定
    a = W.hear_through_door(src, side="wife", level="mid", seed=42, mode="a")
    b = W.hear_through_door(src, side="wife", level="mid", seed=42, mode="a")
    assert a == b and a
    # 換種子可以不一樣（多試幾顆）
    variants = {W.hear_through_door(src, side="wife", level="mid", seed=s, mode="a") for s in range(1, 40)}
    assert len(variants) >= 2
    # 斷續：至少兩段，非空，保住大意
    for seed in range(1, 30):
        hit = W.hear_line(src, side="wife", level="mid", seed=seed, mode="a")
        assert hit["text"]
        assert len(hit["fragments"]) >= 2
        kept = "".join(hit["fragments"])
        assert kept[0] == "你" or "你" in hit["text"]
        assert any(ch in kept for ch in "可射進")
        assert "幼" not in hit["text"]
    # 吟叫模式也非空，妻子較常出現吟叫詞
    moaned = False
    for seed in range(1, 40):
        hit = W.hear_line(src, side="wife", level="heavy", seed=seed, mode="b")
        assert hit["text"]
        if any(m in hit["text"] for m in W.WIFE_MOANS):
            moaned = True
    assert moaned
    # 系統提示有要求吟叫／斷續
    assert "吟叫" in W.DEFAULT_DIALOG["system"]
    assert "斷續" in W.DEFAULT_DIALOG["system"]


def test_door_muffle_config():
    assets = _assets()
    cfg = W.load_config(assets)
    assert cfg["door_muffle"] is True
    assert cfg["door_muffle_level"] == "mid"
    saved = W.save_config(assets, {"door_muffle": False, "door_muffle_level": "重"})
    assert saved["door_muffle"] is False
    assert saved["door_muffle_level"] == "heavy"
    # 只改打字速度時不要蓋掉
    again = W.save_config(assets, {"char_sec": 0.6})
    assert again["char_sec"] == 0.6
    assert again["door_muffle"] is False
    assert again["door_muffle_level"] == "heavy"
    # 遷 1.2 秒時保留隔門設定
    path = W.config_path(assets)
    path.write_text(json.dumps({
        "char_sec": 1.2, "poses": [], "door_muffle": False, "door_muffle_level": "light",
    }, ensure_ascii=False), encoding="utf-8")
    migrated = W.load_config(assets)
    assert migrated["char_sec"] == 0.9
    assert migrated["door_muffle"] is False
    assert migrated["door_muffle_level"] == "light"



def test_pose_unlimited_pick():
    assets = _assets()
    a = W.add_item(assets, PNG, tags=["cowgirl", "bed"])
    b = W.add_item(assets, PNG, tags=["cowgirl"])
    c = W.add_item(assets, PNG, tags=["cowgirl"])
    # 同一姿勢可存很多張，第三張也保留 cowgirl
    assert "cowgirl" in (c.get("tags") or [])
    gal = W.load_gallery(assets)
    cow = [it for it in gal["items"] if "cowgirl" in (it.get("tags") or [])]
    assert {it["id"] for it in cow} == {a["id"], b["id"], c["id"]}
    # patch 可再加上姿勢／其他 tag
    hit = W.patch_item(assets, c["id"], {"tags": ["cowgirl", "bed"]})
    assert "cowgirl" in (hit.get("tags") or [])
    assert "bed" in (hit.get("tags") or [])
    assert not hit.get("rejected_poses")
    keep = W.patch_item(assets, a["id"], {"tags": ["cowgirl", "bed"]})
    assert "cowgirl" in keep["tags"]
    # 使用時從全部已選的抽 1 或 2 張，三張都可能被抽到
    counts = {len(W.pick_items(gal["items"], pose="cowgirl", rnd=random.Random(i))) for i in range(40)}
    assert counts == {1, 2}
    seen = set()
    for i in range(80):
        seen |= {x["id"] for x in W.pick_items(gal["items"], pose="cowgirl", count=2, rnd=random.Random(i))}
    assert seen == {a["id"], b["id"], c["id"]}



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
    test_scripts_seed_and_merge()
    test_config_char_sec_persist()
    test_pick_peek_side_consistency()
    test_global_prompts_compose_and_config()
    test_global_gaze_migration()
    test_img2img_workflow_passes_negative()
    test_hear_through_door()
    test_door_muffle_config()
    test_pose_unlimited_pick()
    print("wifepay_test: ok")
