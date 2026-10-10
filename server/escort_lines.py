"""接客偷看的 AI 台詞（2026-10-10）：一次要 12～16 句，客人／她輪流。模型寫不好就回空，手機用本地句庫（escort_voices.js）。
框架：你情我願的激烈（成年人、自願接客還債）；不寫強迫、不寫未成年。"""
from __future__ import annotations

import re

POSE_ZH = {"missionary": "傳教士（她仰躺）", "cowgirl": "騎乘（她在上面）", "doggy": "老漢推車（她跪趴、他從後面）",
           "kiss": "面對面坐著擁吻", "reverse": "背向坐在他腿上、他從後面揉她的胸"}
BUILD_ZH = {"average": "普通身材", "slim": "瘦小", "muscular": "肌肉結實", "fat": "大肚子胖子", "tall": "高大",
            "short": "矮個子", "old": "年紀大、駝背的大叔"}
VOICE_ZH = {"scream": "叫得很大聲", "refuse": "嘴上說不要但身體很誠實", "gasp": "喘不過氣、斷斷續續",
            "beggy": "撒嬌求饒（慢一點、輕一點）", "blankish": "被弄到恍神、只剩單音"}
STAGE_ZH = {"wife": "老婆", "devoted": "死心塌地的老婆", "obedient": "百依百順的老婆", "pathological": "病嬌老婆"}
BANNED = ("強暴", "強姦", "迷姦", "未成年", "國中", "國小", "小學", "高中生", "幼", "蘿莉", "放開我", "救命", "報警")
CLIENT_MAX, WIFE_MAX = 22, 26


def prompt(info: dict) -> tuple[str, str]:
    pose = POSE_ZH.get(str(info.get("pose") or ""), "做愛")
    build = BUILD_ZH.get(str(info.get("build") or ""), "普通身材")
    voice = VOICE_ZH.get(str(info.get("voice") or ""), "")
    stage = STAGE_ZH.get(str(info.get("stage") or ""), "老婆")
    name = str(info.get("name") or "").strip()
    who = f"常客{name}（她認得他）" if info.get("regular") and name else "第一次來的陌生客人"
    system = (
        "你替成人戀愛模擬遊戲寫字幕台詞。場景：成年女性為了替丈夫（玩家）還債，自願去接客；玩家從半開的門偷看。"
        "雙方都是成年人、你情我願，可以粗口、激烈、求饒式撒嬌（慢一點、輕一點、會壞掉），"
        "但絕對不要寫強迫、不同意、暴力、未成年或任何救命／報警類台詞。只寫台詞，不寫旁白。"
        "格式：每行一句，開頭「客：」或「她：」，客／她輪流，共 14 行。客人每句 ≤ 14 字，她每句 ≤ 16 字。繁體中文。"
    )
    extra = []
    if voice:
        extra.append(f"她的叫聲類型：{voice}")
    if info.get("family"):
        extra.append(f"她的個性：{info['family']}")
    user = (
        f"體位：{pose}。\n客人：{build}，{who}。\n她是玩家的{stage}，現在在服務客人；偶爾會想到老公但不會說出名字。\n"
        + ("\n".join(extra) + "\n" if extra else "")
        + ("接著前面的寫，不要重複：\n" + "\n".join(info.get("have") or [])[-600:] + "\n" if info.get("have") else "")
        + "開始："
    )
    return system, user


LINE_RE = re.compile(r"^\s*[-*\d.、)]*\s*(客人?|她|妻子?|老婆)\s*[:：]\s*(.+?)\s*$")


def parse(reply: str) -> list[dict]:
    out: list[dict] = []
    for raw in str(reply or "").splitlines():
        m = LINE_RE.match(raw)
        if not m:
            continue
        side = "client" if m.group(1).startswith("客") else "wife"
        text = m.group(2).strip().strip("「」\"'")
        if not text or any(b in text for b in BANNED):
            continue
        if len(text) > (CLIENT_MAX if side == "client" else WIFE_MAX):
            continue
        out.append({"side": side, "text": text})
    sides = {l["side"] for l in out}
    return out if len(out) >= 6 and sides == {"client", "wife"} else []
