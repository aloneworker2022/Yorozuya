"""日租女友 LINE 的 AI 訊息（2026-10-13）：一次寫一則。客人傳給「經紀人」（他不知道經紀人其實是她老公）；
她傳給老公（照誠實度：誠實／輕描淡寫／說謊）。模型沒回或寫壞就回空字串，手機用句庫（web/content/rental_lines.js）。
所有內容都照手機帶來的「真相」寫，不准編造真相裡沒有的事。成年人、自願；不寫強迫、不寫未成年。"""
from __future__ import annotations

import re

STAGE_ZH = {"wife": "妻子", "devoted_wife": "貼心妻子", "obedient_wife": "順從妻子", "pathological_wife": "病態妻子"}
HONEST_RULE = {
    "honest": "對老公誠實：發生什麼就說什麼（可以害羞、愧疚或撒嬌），但不講露骨細節。",
    "downplay": "對老公輕描淡寫：把事情講得比實際輕，略過親近的動作或說成沒什麼。",
    "lie": "對老公說謊：說什麼事都沒有、他很規矩、只是普通吃飯逛街。",
}
PERSONA_RULE = {
    "紳士": "客氣、有禮貌、用「您」，會先徵詢再行動。",
    "黏人": "熱情、話多、愛撒嬌、常用～和！，一直想多待一點。",
    "炫耀": "得意、愛跟經紀人炫耀她多正、多上道，偶爾輕佻。",
    "強勢": "話少、命令句、很有把握，不太理人。",
    "害羞宅男": "結巴（那、那個……）、緊張、不敢相信自己這麼幸運，會自顧自當作她答應了。",
}
BANNED = ("強暴", "強姦", "迷姦", "未成年", "國中", "國小", "小學", "高中生", "蘿莉", "救命", "報警", "放開我")
MAX_LEN = 70


def _ctx(info: dict) -> str:
    g, c, s = info.get("girl") or {}, info.get("client") or {}, info.get("spot") or {}
    lines = [
        f"她：{g.get('name') or '她'}，玩家的{STAGE_ZH.get(str(g.get('stage') or ''), '妻子')}，個性{g.get('family') or ''}"
        + (f"（{g.get('archetype')}）" if g.get("archetype") else "") + "。",
        f"客人：{c.get('name') or '客人'}，{c.get('age') or ''} 歲，個性「{c.get('persona') or ''}」"
        + ("，是常客" if c.get("regular") else "") + "。",
        f"今天行程：{' → '.join(info.get('plan') or [])}。",
    ]
    if s:
        truth = f"這一站的真相：在{s.get('place')}，{s.get('item') or ''}"
        beats = [b for b in s.get("beats") or [] if isinstance(b, dict) and b.get("t")]
        ok = [str(b["t"]) for b in beats if b.get("ok")]
        no = [str(b["t"]) for b in beats if not b.get("ok")]
        if ok:
            truth += f"；她接受了：{'、'.join(ok)}"
        if no:
            truth += f"；他想做但她閃開了：{'、'.join(no)}"
        if not beats:
            truth += "；沒有任何親近的動作"
        if s.get("gift"):
            truth += "；他買了東西送她"
        if s.get("drunk"):
            truth += "；她喝得有點醉"
        lines.append(truth + "。")
    if info.get("hotel"):
        lines.append(f"旅館的真相：{info['hotel']}。")
    if info.get("recent"):
        lines.append("這個聊天室最近的訊息：\n" + "\n".join(str(x) for x in info["recent"][-6:]))
    return "\n".join(lines)


def prompt(info: dict) -> tuple[str, str]:
    side, kind = str(info.get("side") or ""), str(info.get("kind") or "")
    phase = str(info.get("phase") or "date")
    c = info.get("client") or {}
    if side == "client":
        system = (
            "你替成人戀愛模擬遊戲寫 LINE 訊息。玩家的妻子今天去當「日租女友」陪客人約會；客人以為玩家只是她的經紀人，"
            "不知道他們是夫妻。你扮演客人，傳訊息給經紀人。"
            f"客人的說話方式：{PERSONA_RULE.get(str(c.get('persona') or ''), '自然')}"
            "只寫一則訊息，口語、繁體中文、40 字以內，不要旁白、不要引號、不要加名字前綴。"
            "一定照「真相」寫：真相沒有的親近動作、禮物、喝醉都不准編；她閃開的就是沒做到。成年人、自願；不寫強迫或未成年。"
        )
        if kind == "spot":
            task = ("寫他在這一站傳給經紀人的訊息（報告她在做什麼、他的感想；她接受的親密動作可以得意地講，她閃開的會失望或抱怨）。"
                    "一定要講出現在在哪裡（地點名稱），經紀人事先不知道行程。")
        elif phase == "hotel":
            task = f"經紀人剛傳來：「{info.get('text') or ''}」。他們正在旅館裡，他很忙：回得很短、敷衍，或得意地炫耀一句。"
        else:
            task = f"經紀人剛傳來：「{info.get('text') or ''}」。寫客人的回覆。"
    else:
        g = info.get("girl") or {}
        system = (
            f"你扮演成人戀愛模擬遊戲裡的{g.get('name') or '她'}，玩家（你老公）的{STAGE_ZH.get(str(g.get('stage') or ''), '妻子')}。"
            "你今天去當日租女友陪客人約會，正在用 LINE 傳訊息給老公。客人不知道他是你老公。"
            f"{HONEST_RULE.get(str(info.get('honesty') or 'honest'), HONEST_RULE['honest'])}"
            "只寫一則訊息，口語、繁體中文、35 字以內，可以叫他老公，不要旁白、不要引號、不要加名字前綴。"
            "照你的個性說話。成年人、自願；不寫強迫或未成年。"
        )
        if kind == "spot":
            task = "寫你在這一站主動傳給老公的訊息。"
        elif phase == "hotel":
            task = f"老公剛傳來：「{info.get('text') or ''}」。你正在旅館裡跟客人，不方便：回得很短、慢，或只回一兩個字。"
        else:
            task = f"老公剛傳來：「{info.get('text') or ''}」。寫你的回覆。"
    return system, _ctx(info) + "\n\n" + task


QUOTE_RE = re.compile(r"^[「『\"'“]+|[」』\"'”]+$")
PREFIX_RE = re.compile(r"^\s*(客人?|她|妻子?|老婆|[\w一-鿿]{1,6})\s*[:：]\s*")


def parse(reply: str) -> str:
    """取第一行有內容的，去掉引號／名字前綴；太長、有禁字就不要。"""
    for raw in str(reply or "").splitlines():
        t = raw.strip()
        if not t or t.startswith(("（", "(", "*")):
            continue
        t = PREFIX_RE.sub("", t, count=1) if PREFIX_RE.match(t) and len(PREFIX_RE.match(t).group(0)) <= 8 else t
        t = QUOTE_RE.sub("", t).strip()
        if not t or len(t) > MAX_LEN or any(b in t for b in BANNED):
            return ""
        return t
    return ""


# ── 玩家在 LINE 說的話是鼓勵／勸阻／普通（2026-10-15）：一點點影響後面的場景 ──
INTENT_WORD = {"鼓勵": "encourage", "勸阻": "restrain", "普通": "none"}


def intent_prompt(side: str, text: str) -> tuple[str, str]:
    who = "她（玩家的妻子，正在當日租女友陪客人約會）" if side == "wife" else "客人（以為玩家只是她的經紀人）"
    system = ("你是分類器。判斷玩家傳給對方的一句 LINE 是在「鼓勵」對方在約會裡更放開、更親密、更大膽，"
              "還是「勸阻」對方保守一點、別太過分，或只是「普通」聊天。只回一個詞：鼓勵／勸阻／普通。")
    return system, f"對方：{who}\n玩家說：「{str(text or '')[:120]}」"


def parse_intent(reply: str) -> str:
    t = str(reply or "")
    for word, key in INTENT_WORD.items():
        if word in t:
            return key
    return ""
