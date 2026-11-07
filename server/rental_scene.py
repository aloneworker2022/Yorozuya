"""日租女友・旅館房間裡的流程（2026-10-17 Al）：點到她和客人時，即時寫一段兩人的對話。
每點一次就重寫一次（不快取）；模型寫不好就回空，伺服器改給固定句庫（FALLBACK）。
框架跟 escort_lines 一樣：成年人、她已經答應了；不寫強迫、不寫未成年。

另外管 test_room 生的「房型 × 地點姿勢」圖：assets/rental_scenes/manifest.json
  {venue: {"bed_kiss": [url, url], "bed_missionary": [...], ...}}，每格最多 2 張。
"""
from __future__ import annotations

import json
import random
import re
from pathlib import Path

import escort_lines

VENUES = {"ryokan": "溫泉旅館（日式和室、榻榻米、木造浴池）", "hotel": "旅館（雙人床、大理石浴缸）", "motel": "汽車旅館（霓虹燈、按摩浴缸）"}
SLOTS = {   # key → (地點, 姿勢說明)
    "bed_kiss": ("床鋪", "坐在床邊面對面擁吻、還沒脫完衣服"),
    "bed_undress": ("床鋪", "在床邊一邊接吻一邊幫對方脫衣服（衣服脫到一半）"),
    "bed_missionary": ("床鋪", "傳教士（她仰躺在床上、他在上面）"),
    "bed_doggy": ("床鋪", "老漢推車（她在床上跪趴、他從後面）"),
    "bath_soak": ("浴室", "兩人一起泡在浴池裡，她坐在他腿上往後靠"),
    "bath_standing": ("浴室", "站著從後面（她彎腰扶著浴缸邊、他站在後面）"),
}
SLOTS_PER = 2
# 2026-10-18 Al：每個做愛姿勢（接吻／邊親邊脫以外）多兩種結尾圖：她高潮、他內射。圖的 key＝「姿勢~變體」。
VARIANTS = {"orgasm": "她高潮了（全身發抖、弓起背、失神）", "cum": "他射在她裡面（內射、精液滿出來）"}
ACT_KEYS = [k for k in SLOTS if k not in ("bed_kiss", "bed_undress")]
PHASE_FALLBACK = {
    "orgasm": [("client", "你在抖耶。"), ("wife", "不、不行了……要去了……"), ("client", "去吧，我看著。"), ("wife", "啊……腦袋一片白……"),
               ("client", "夾得好緊。"), ("wife", "……還、還在抖……")],
    "cum": [("client", "要射了，全部射在裡面。"), ("wife", "嗯……裡面……"), ("client", "好多……"), ("wife", "好燙……流出來了……"),
            ("client", "還在跳。"), ("wife", "……都給我了呢。")],
}


def allowed_key(key: str) -> bool:
    """圖的 key：SLOTS，或 ACT_KEYS 的「~orgasm／~cum」變體。"""
    base, _, var = str(key or "").partition("~")
    return base in SLOTS and (not var or (var in VARIANTS and base in ACT_KEYS))
BUILD_ZH = escort_lines.BUILD_ZH
FALLBACK = {
    "bed_kiss": [("client", "終於只剩我們兩個了。"), ("wife", "……你、你靠太近了啦。"), ("client", "今天一整天都想這樣。"), ("wife", "嗯……親輕一點。"),
                 ("client", "你的臉好紅。"), ("wife", "不要一直看嘛……")],
    "bed_undress": [("client", "幫我解開扣子。"), ("wife", "……手、手在抖啦。"), ("client", "換我脫你的。"), ("wife", "不要一直看……"),
                    ("client", "好想快點看到全部。"), ("wife", "嗯……你也脫掉嘛。")],
    "bed_missionary": [("client", "看著我。"), ("wife", "不、不要盯著看……"), ("client", "你好緊……"), ("wife", "慢、慢一點……"),
                       ("client", "要射了，射在裡面喔。"), ("wife", "……嗯、裡面……")],
    "bed_doggy": [("client", "屁股再翹高一點。"), ("wife", "這樣……好丟臉……"), ("client", "從後面看好色。"), ("wife", "太、太深了……"),
                  ("client", "全部給你。"), ("wife", "啊……好燙……")],
    "bath_soak": [("client", "水溫剛好吧？"), ("wife", "嗯……好舒服。"), ("client", "靠過來一點。"), ("wife", "你的手……在摸哪裡啦。"),
                  ("client", "在水裡也要做。"), ("wife", "……會被你弄暈的。")],
    "bath_standing": [("client", "扶好浴缸。"), ("wife", "腳、腳在抖……"), ("client", "聲音在浴室好大。"), ("wife", "不要說出來啦……"),
                      ("client", "最後射在裡面。"), ("wife", "……嗯、都給我……")],
}


def slot_key(loc: str, pose: str) -> str:
    k = f"{loc}_{pose}"
    return k if k in SLOTS else ""


def prompt(info: dict) -> tuple[str, str]:
    key = slot_key(str(info.get("loc") or ""), str(info.get("pose") or "")) or "bed_kiss"
    where, pose = SLOTS[key]
    venue = VENUES.get(str(info.get("venue") or ""), "旅館")
    girl = info.get("girl") if isinstance(info.get("girl"), dict) else {}
    client = info.get("client") if isinstance(info.get("client"), dict) else {}
    stage = {"wife": "老婆", "devoted_wife": "死心塌地的老婆", "obedient_wife": "百依百順的老婆", "pathological_wife": "病嬌老婆"}.get(str(girl.get("stage") or ""), "老婆")
    build = BUILD_ZH.get(str(client.get("build") or ""), "普通身材")
    system = (
        "你替成人戀愛模擬遊戲寫兩人的即時對話。場景：成年女性是玩家的妻子，接了日租女友的工作，約會後答應跟客人去旅館休息；"
        "客人不知道玩家是她老公，以為玩家只是經紀人。雙方都是成年人、她已經答應了，可以害羞、撒嬌、喘、粗口，"
        "但絕對不要寫強迫、不同意、暴力、未成年或救命／報警類台詞。只寫台詞，不寫旁白。"
        "格式：每行一句，開頭「客：」或「她：」，客／她輪流，共 8 行。客人每句 ≤ 18 字，她每句 ≤ 20 字。繁體中文。"
        + ("這一段結束時他射在她裡面，最後兩行要寫到。" if key not in ("bed_kiss", "bed_undress") else ("現在一邊接吻一邊互相脫衣服，還沒有做。" if key == "bed_undress" else "現在只是接吻愛撫，還沒有做。"))
    )
    lines = [f"地點：{venue}的{where}。", f"現在：{pose}。",
             f"她：{girl.get('name') or '她'}，玩家的{stage}，個性家族「{girl.get('family') or '溫柔'}」{('、' + str(girl.get('archetype'))) if girl.get('archetype') else ''}。偶爾會想到老公但不會說出來。",
             f"客人：{client.get('name') or '客人'}，{build}{('，個性' + str(client.get('persona'))) if client.get('persona') else ''}{'，是常客' if client.get('regular') else ''}。"]
    phase = str(info.get("phase") or "")
    if phase in VARIANTS and key in ACT_KEYS:
        lines.append(f"這一段快結束了：{VARIANTS[phase]}。台詞全部寫這一刻" + ("，她在高潮。" if phase == "orgasm" else "，他正在射進她裡面、她感覺到。"))
    if info.get("step"):
        lines.append(f"這是今天在房間裡的第 {int(info.get('step') or 0)} 段。")
    if info.get("cums"):
        lines.append(f"他今天已經在她裡面射過 {int(info.get('cums') or 0)} 次。")
    return system, "\n".join(lines) + "\n開始："


LINE_RE = escort_lines.LINE_RE


def parse(reply: str) -> list[dict]:
    out: list[dict] = []
    for raw in str(reply or "").splitlines():
        m = LINE_RE.match(raw)
        if not m:
            continue
        side = "client" if m.group(1).startswith("客") else "wife"
        text = m.group(2).strip().strip("「」\"'")
        if not text or any(b in text for b in escort_lines.BANNED) or len(text) > 30:
            continue
        out.append({"side": side, "text": text})
    return out if len(out) >= 4 and {l["side"] for l in out} == {"client", "wife"} else []


def fallback(loc: str, pose: str, phase: str = "") -> list[dict]:
    key = slot_key(loc, pose) or "bed_kiss"
    if phase in PHASE_FALLBACK and key in ACT_KEYS:
        return [{"side": s, "text": t} for s, t in PHASE_FALLBACK[phase]]
    return [{"side": s, "text": t} for s, t in FALLBACK[key]]


# ------------------------------------------------------------------ 圖片 manifest
def manifest_path(assets: Path) -> Path:
    return assets / "rental_scenes" / "manifest.json"


def load_manifest(assets: Path) -> dict:
    p = manifest_path(assets)
    try:
        data = json.loads(p.read_text("utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_manifest(assets: Path, data: dict) -> None:
    p = manifest_path(assets)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    tmp.replace(p)


OWNER = re.compile(r"^[A-Za-z0-9_\-]{1,64}\|[A-Za-z0-9_\-*]{1,64}$")


def owner_key(owner: str) -> str:
    """「她 id|客人 id」（客人 * ＝這個她、任何客人）→ manifest 裡的 "@她|客"；不合格回空字串（＝通用圖）。"""
    o = str(owner or "").strip()
    return "@" + o if OWNER.match(o) else ""


DRIVE_FALLBACK = {
    "ryokan": "車子沿著湖邊的山路慢慢開。後座很安靜，只聽得到她偶爾的笑聲，和客人壓低的說話聲。後照鏡裡，他的手搭在她的膝蓋上，她沒有撥開。溫泉旅館的燈籠在轉角亮起來了。",
    "hotel": "市區的紅燈一個接一個。後座的兩個人靠得越來越近，她把頭靠在客人肩上，輕聲說著什麼。你握緊方向盤，假裝專心看路。旅館的招牌在前面閃著。",
    "motel": "車開下交流道，霓虹燈的光一格一格掃過車內。後座傳來衣服摩擦的聲音，她小聲說了句「等一下啦」。汽車旅館的鐵捲門已經在前面拉起一半。",
}


def drive_prompt(info: dict) -> tuple[str, str]:
    """開車送他們去旅館的旁白（玩家＝開車的老公，客人不知道）。"""
    venue = VENUES.get(str(info.get("venue") or ""), "旅館")
    girl = info.get("girl") if isinstance(info.get("girl"), dict) else {}
    client = info.get("client") if isinstance(info.get("client"), dict) else {}
    build = BUILD_ZH.get(str(client.get("build") or ""), "普通身材")
    system = ("你替成人戀愛模擬遊戲寫一段旁白。玩家開車送自己的妻子和日租女友的客人去旅館，客人不知道司機是她老公。"
              "雙方都是成年人、她已經答應了。用第二人稱「你」寫，寫後座兩人的互動和你的心情，3～5 句、共 80～140 字，繁體中文。"
              "只寫旁白，不要標題、不要對話引號以外的格式，不寫強迫、暴力、未成年。")
    user = f"目的地：{venue}。她：{girl.get('name') or '她'}。客人：{client.get('name') or '客人'}，{build}{('，個性' + str(client.get('persona'))) if client.get('persona') else ''}。"
    return system, user


def parse_narration(reply: str) -> str:
    t = " ".join(x.strip() for x in str(reply or "").splitlines() if x.strip())
    if not (20 <= len(t) <= 400) or any(b in t for b in escort_lines.BANNED):
        return ""
    return t


def prompts_path(assets: Path) -> Path:
    return assets / "rental_scenes" / "prompts.json"


def image_key_ok(k: str) -> bool:
    """每一張圖一組模板：「格#第幾張」（姿勢 #0／#1；結尾變體只有 #0）。"""
    key, _, idx = str(k or "").partition("#")
    if not allowed_key(key) or not idx.isdigit():
        return False
    return int(idx) < (1 if "~" in key else SLOTS_PER)


def migrate_prompts(data: dict) -> tuple[dict, bool]:
    """2026-10-18：舊版一格一組（沒有 #）→ 拆給這格的每一張（#0、#1；變體只有 #0）；已有自己那張的不蓋。"""
    changed = False
    for venue, row in list(data.items()):
        if not isinstance(row, dict):
            continue
        for k in [k for k in row if "#" not in k]:
            t = row.pop(k)
            changed = True
            if not allowed_key(k):
                continue
            for i in range(1 if "~" in k else SLOTS_PER):
                row.setdefault(f"{k}#{i}", t)
    return data, changed


def load_prompts(assets: Path) -> dict:
    """設計師在 test_room 存的提示詞模板：{venue: {"格#張": {pos, neg, img2img:{on, ref, denoise}}}}（每一張各一組、全域不分她）。"""
    try:
        data = json.loads(prompts_path(assets).read_text("utf-8"))
        data = data if isinstance(data, dict) else {}
    except Exception:
        return {}
    data, changed = migrate_prompts(data)
    if changed:
        save_prompts(assets, data)
    return data


def save_prompts(assets: Path, data: dict) -> None:
    p = prompts_path(assets)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    tmp.replace(p)


def clean_prompt(t) -> dict | None:
    """一格模板：pos／neg 字串（≤4000 字），img2img {on, ref（/assets/pose_refs/…）, denoise 0.3–0.95}。空的 → None（＝用預設）。"""
    if not isinstance(t, dict):
        return None
    pos, neg = str(t.get("pos") or "")[:4000], str(t.get("neg") or "")[:4000]
    i2 = t.get("img2img") if isinstance(t.get("img2img"), dict) else {}
    ref = str(i2.get("ref") or "")
    if not ref.startswith("/assets/pose_refs/"):
        ref = ""
    try:
        dn = max(0.3, min(0.95, float(i2.get("denoise") or 0.6)))
    except (TypeError, ValueError):
        dn = 0.6
    out = {"pos": pos, "neg": neg, "img2img": {"on": bool(i2.get("on")) and bool(ref), "ref": ref, "denoise": dn}}
    return out if (pos.strip() or neg.strip() or ref) else None


def put_image(data: dict, venue: str, key: str, slot: int, url: str, owner: str = "") -> dict:
    v = data.setdefault(venue, {})
    ok = owner_key(owner)
    if ok:
        v = v.setdefault(ok, {})
    row = v.setdefault(key, [])
    while len(row) < SLOTS_PER:
        row.append("")
    row[max(0, min(SLOTS_PER - 1, int(slot)))] = url
    return data


def pick(data: dict, venue: str, key: str, r=random.random, owners=()) -> str:
    v = data.get(venue) or {}
    urls = []
    for o in owners or ():
        urls = [u for u in (((v.get(owner_key(o)) or {}) if owner_key(o) else {}).get(key) or []) if u]
        if urls:
            break
    if not urls:
        urls = [u for u in (v.get(key) or []) if u]
    return urls[int(r() * len(urls))] if urls else ""


SAFE = re.compile(r"^[a-z_]+$")
