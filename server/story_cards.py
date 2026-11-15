"""故事卡抽卡引擎（2026-11-15 使用者：故事太少、每個妹子遇到一樣的 → 用故事卡配對起承轉合）。

一件事 = 起、承、轉、合四張牌，各從自己那疊抽，再交給模型寫成一段。
  - 牌帶標籤：起牌的 `gives` 放進故事的標籤袋，下一格只抽 `needs` 全在袋子裡的牌（接得起來）。
  - 起牌看她在哪（place）、什麼時段（time：morning/day/evening/night）、地區（region，空＝全國）、季節（season，空＝四季）。
  - 權重：牌的 `traits` 對上她的個性字（archetype／tone／個性清單）就乘上去，`moods` 對上當下心情也乘；
    色情牌的 `heat`（1～3）越高，越吃她的性慾等級。
  - 每個妹子記自己抽過什麼（storySeen：牌 → 最後一次的時間；storyCombos：四張的組合），
    起牌冷卻 STORY_START_COOL_MS、同一組四張永遠不重複。
  - 合牌的 `learn` 寫進永久的人生經歷 rec["lifeStory"]（不淡、不刪；超過 LIFE_STORY_CAP 只合併最舊的日常）。
牌組格式見 validate_card；牌組內容放 story_decks（其欸起草），這裡只附一小疊示範牌給測試用。
內容規則：只寫成年人；不碰動物、未成年、亂倫、排泄；脅迫只寫她撞見後的反應與後果（BAN_RE 載入時就擋）。
"""
from __future__ import annotations

import random
import re
from datetime import datetime
from zoneinfo import ZoneInfo

_TOKYO = ZoneInfo("Asia/Tokyo")
HOUR_MS = 60 * 60 * 1000
SLOTS = ("起", "承", "轉", "合")
DECKS = ("daily", "horror", "erotic", "first")
TIMES = ("morning", "day", "evening", "night")
SEASONS = ("spring", "summer", "autumn", "winter")
LEARN_KINDS = ("first", "lesson", "fear", "love", "habit", "speech")
STORY_START_COOL_MS = 10 * 24 * HOUR_MS   # 同一張起牌至少隔 10 天才會再抽到
STORY_SEEN_CAP = 400
STORY_COMBO_CAP = 400
LIFE_STORY_CAP = 120
LIBIDO_HEAT = {"N": 0.5, "R": 0.8, "S": 1.0, "SS": 1.3, "SSR": 1.6}   # 每一級 heat 乘一次

BAN_RE = re.compile(
    r"學生|制服|校服|少女|少年|女孩|男孩|小孩|孩子|幼|未成年|亂倫|排泄|尿|屎|糞|"
    r"動物|人獸|獸交|獸姦|野獸|狗|貓|馬匹|家畜|牲畜|強暴|強姦|迷姦"
)


class CardError(ValueError):
    pass


def validate_card(card: dict) -> dict:
    """一張牌：
    {id, deck, slot, text,
     place?: [地點類型], time?: [TIMES], region?: [regionId], season?: [SEASONS],   ← 只看起牌
     needs?: [標籤], gives?: [標籤],
     traits?: {個性字: 倍率}, moods?: {心情: 倍率}, heat?: 0～3,
     learn?: {kind: LEARN_KINDS, text}}                                             ← 合牌一定要有
    """
    if not isinstance(card, dict):
        raise CardError("牌要是 dict")
    cid = str(card.get("id") or "")
    if not cid:
        raise CardError("牌沒有 id")
    if card.get("deck") not in DECKS:
        raise CardError(f"{cid}: deck 要是 {DECKS}")
    if card.get("slot") not in SLOTS:
        raise CardError(f"{cid}: slot 要是 {SLOTS}")
    text = str(card.get("text") or "").strip()
    if not text:
        raise CardError(f"{cid}: 沒有 text")
    learn = card.get("learn")
    if card["slot"] == "合":
        if not isinstance(learn, dict) or learn.get("kind") not in LEARN_KINDS or not str(learn.get("text") or "").strip():
            raise CardError(f"{cid}: 合牌要有 learn {{kind, text}}")
    for k in ("time",):
        bad = [x for x in card.get(k) or [] if x not in TIMES]
        if bad:
            raise CardError(f"{cid}: time 不認得 {bad}")
    bad = [x for x in card.get("season") or [] if x not in SEASONS]
    if bad:
        raise CardError(f"{cid}: season 不認得 {bad}")
    heat = int(card.get("heat") or 0)
    if not 0 <= heat <= 3:
        raise CardError(f"{cid}: heat 0～3")
    blob = text + " " + str((learn or {}).get("text") or "")
    hit = BAN_RE.search(blob)
    if hit:
        raise CardError(f"{cid}: 內容碰到禁區「{hit.group(0)}」")
    return card


def load_deck(cards: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for c in cards:
        validate_card(c)
        if c["id"] in seen:
            raise CardError(f"牌 id 重複：{c['id']}")
        seen.add(c["id"])
        out.append(c)
    return out


def season_of(now_ms: int) -> str:
    m = datetime.fromtimestamp(now_ms / 1000, _TOKYO).month
    return "spring" if m in (3, 4, 5) else "summer" if m in (6, 7, 8) else "autumn" if m in (9, 10, 11) else "winter"


def time_of(now_ms: int) -> str:
    h = datetime.fromtimestamp(now_ms / 1000, _TOKYO).hour
    return "morning" if 5 <= h < 10 else "day" if 10 <= h < 17 else "evening" if 17 <= h < 21 else "night"


def _traits(rec: dict) -> str:
    bits = [rec.get("archetype") or "", rec.get("tone") or ""]
    bits += [str(x) for x in rec.get("personality") or []]
    bits += [str(g.get("text") or "") for g in rec.get("growth") or [] if isinstance(g, dict)]
    return " ".join(bits)


def card_weight(card: dict, rec: dict, mood: str = "") -> float:
    w = float(card.get("weight") or 1.0)
    traits = _traits(rec)
    for word, mult in (card.get("traits") or {}).items():
        if word and word in traits:
            w *= float(mult)
    if mood:
        w *= float((card.get("moods") or {}).get(mood, 1.0))
    heat = int(card.get("heat") or 0)
    if heat:
        g = str(rec.get("libido") or "R").upper()
        w *= LIBIDO_HEAT.get(g, 0.8) ** heat
    return max(0.0, w)


def _fits_start(card: dict, ctx: dict) -> bool:
    for key in ("place", "time", "region", "season"):
        allowed = card.get(key) or []
        if allowed and ctx.get(key) not in allowed:
            return False
    return True


def _pick(cards: list[dict], weights: list[float], rnd) -> dict | None:
    total = sum(weights)
    if total <= 0:
        return None
    r = float(rnd()) * total
    for c, w in zip(cards, weights):
        r -= w
        if r < 0:
            return c
    return cards[-1]


def _combo_key(cards: list[dict]) -> str:
    return "|".join(c["id"] for c in cards)


def draw_story(rec: dict, deck: list[dict], deck_id: str, now_ms: int, place: str = "",
               mood: str = "", rnd=None, tries: int = 12) -> dict | None:
    """抽一件事。抽不到接得起來、又沒用過的四張就回 None（那一趟照舊走原本的事件）。"""
    roll = rnd if rnd is not None else random.random
    ctx = {"place": place, "time": time_of(now_ms), "season": season_of(now_ms), "region": rec.get("regionId") or ""}
    seen = rec.get("storySeen") or {}
    combos = set(rec.get("storyCombos") or [])
    pool = [c for c in deck if c["deck"] == deck_id]
    starts = [c for c in pool if c["slot"] == "起" and _fits_start(c, ctx)
              and now_ms - int(seen.get(c["id"]) or -STORY_START_COOL_MS) >= STORY_START_COOL_MS]
    for _ in range(tries):
        if not starts:
            return None
        start = _pick(starts, [card_weight(c, rec, mood) for c in starts], roll)
        if start is None:
            return None
        picked, tags, ok = [start], set(start.get("gives") or []), True
        for slot in SLOTS[1:]:
            cand = [c for c in pool if c["slot"] == slot and set(c.get("needs") or []) <= tags]
            # 沒用過的優先；全用過才放回去
            fresh = [c for c in cand if c["id"] not in seen]
            use = fresh or cand
            nxt = _pick(use, [card_weight(c, rec, mood) for c in use], roll) if use else None
            if nxt is None:
                ok = False
                break
            picked.append(nxt)
            tags |= set(nxt.get("gives") or [])
        if ok and _combo_key(picked) not in combos:
            return {"deck": deck_id, "cards": picked, "tags": sorted(tags), "ctx": ctx, "at": now_ms}
        if not ok:
            starts = [c for c in starts if c is not start]
    return None


def commit_story(rec: dict, story: dict) -> dict:
    """抽到的這件事真的發生了：記下用過的牌、組合，合牌的 learn 寫進永久人生經歷。回寫進去的那一條。"""
    now_ms = int(story.get("at") or 0)
    seen = rec.setdefault("storySeen", {})
    for c in story["cards"]:
        seen[c["id"]] = now_ms
    if len(seen) > STORY_SEEN_CAP:
        for k, _ in sorted(seen.items(), key=lambda kv: kv[1])[: len(seen) - STORY_SEEN_CAP]:
            seen.pop(k, None)
    combos = rec.setdefault("storyCombos", [])
    combos.append(_combo_key(story["cards"]))
    del combos[:-STORY_COMBO_CAP]
    end = story["cards"][-1]
    learn = end.get("learn") or {}
    item = {
        "at": now_ms,
        "deck": story["deck"],
        "kind": learn.get("kind") or "lesson",
        "text": str(learn.get("text") or ""),
        "cards": [c["id"] for c in story["cards"]],
        "place": story["ctx"].get("place") or "",
        "season": story["ctx"].get("season") or "",
        "private": story["deck"] == "erotic",
    }
    life = rec.setdefault("lifeStory", [])
    life.append(item)
    if len(life) > LIFE_STORY_CAP:
        # 永久：不淡也不刪；太多時只把最舊的一條日常收進「其他」摘要，first／fear／love 一定留著
        for i, x in enumerate(life):
            if x.get("deck") == "daily" and x.get("kind") not in ("first", "fear", "love"):
                life.pop(i)
                rec["lifeStoryFolded"] = int(rec.get("lifeStoryFolded") or 0) + 1
                break
    return item


def story_brief(story: dict, name: str = "她") -> str:
    """給模型的提示：四格照順序，寫成一段通順的經歷，不要列點、不要報牌名。"""
    lines = [f"這是{name}這一趟遇到的事，照起承轉合寫成一段自然的經歷（第三人稱、不列點、不要說出「起承轉合」或卡片）："]
    for slot, c in zip(SLOTS, story["cards"]):
        lines.append(f"{slot}：{c['text']}")
    learn = story["cards"][-1].get("learn") or {}
    if learn.get("text"):
        lines.append(f"最後她記住的是：{learn['text']}（她剛來這個世界，這件事會一直留在她心裡）")
    if story["deck"] == "erotic":
        lines.append("她只是旁觀者，沒有人碰她或找她加入；只寫成年人。")
    if story["deck"] == "horror":
        lines.append("不要寫血腥或傷害過程，恐怖靠氣氛。")
    return "\n".join(lines)


# ── 示範牌（只給測試和接線用；正式內容放 story_decks） ──
SAMPLE_DECK = load_deck([
    {"id": "h-s-sento", "deck": "horror", "slot": "起", "text": "深夜的錢湯只剩她一個人，鏡子起了一層霧。",
     "place": ["sento"], "time": ["night"], "gives": ["sento", "night", "mirror"]},
    {"id": "h-s-train", "deck": "horror", "slot": "起", "text": "末班電車停在一個沒有站名的月台。",
     "place": ["station"], "time": ["night"], "gives": ["train", "night"]},
    {"id": "h-c-wipe", "deck": "horror", "slot": "承", "text": "她伸手擦鏡子，霧氣裡多了一個不是她的手印。",
     "needs": ["mirror"], "gives": ["hand"]},
    {"id": "h-c-door", "deck": "horror", "slot": "承", "text": "車門一直開著，月台上的廣播用聽不懂的方言報站。",
     "needs": ["train"], "gives": ["voice"]},
    {"id": "h-c-steps", "deck": "horror", "slot": "承", "text": "背後傳來木屐的腳步聲，一步一步跟著她的節奏。",
     "needs": ["night"], "gives": ["follow"]},
    {"id": "h-t-run", "deck": "horror", "slot": "轉", "text": "她沒回頭，抓起東西一路跑到有燈的地方。",
     "traits": {"膽小": 3.0, "怕": 2.0, "好奇": 0.3}, "gives": ["fled"]},
    {"id": "h-t-look", "deck": "horror", "slot": "轉", "text": "她忍不住回頭看，那裡站著一個比門還高的女人，戴著白帽子。",
     "traits": {"好奇": 3.0, "大膽": 2.0, "膽小": 0.3}, "gives": ["saw"]},
    {"id": "h-e-salt", "deck": "horror", "slot": "合", "text": "隔天常去的那家店的老闆娘聽了，默默塞給她一小包鹽。",
     "needs": ["fled"], "learn": {"kind": "lesson", "text": "日本人遇到不乾淨的東西會撒鹽"}},
    {"id": "h-e-legend", "deck": "horror", "slot": "合", "text": "她上網查，才知道那叫八尺大人，整晚不敢關燈。",
     "needs": ["saw"], "learn": {"kind": "fear", "text": "怕高個子戴白帽的女人，聽到「ぽぽぽ」會發抖"}},
    {"id": "e-s-park", "deck": "erotic", "slot": "起", "text": "夜裡的公園，長椅後面的樹叢在動。",
     "place": ["park"], "time": ["night", "evening"], "gives": ["outdoor"]},
    {"id": "e-s-hotel", "deck": "erotic", "slot": "起", "text": "商務旅館的隔音很差，隔壁的聲音一直傳過來。",
     "place": ["hotel"], "gives": ["indoor", "wall"]},
    {"id": "e-c-couple", "deck": "erotic", "slot": "承", "text": "一對穿上班族西裝的男女，看起來不是夫妻。",
     "needs": ["outdoor"], "gives": ["affair"], "heat": 1},
    {"id": "e-c-three", "deck": "erotic", "slot": "承", "text": "她聽出來那邊不只兩個人，三個成年人的笑聲混在一起。",
     "needs": ["wall"], "gives": ["three"], "heat": 2},
    {"id": "e-t-watch", "deck": "erotic", "slot": "轉", "text": "她躲在暗處看了下去，臉越來越燙。",
     "traits": {"好奇": 2.0, "大膽": 1.5}, "heat": 2, "gives": ["watched"]},
    {"id": "e-t-leave", "deck": "erotic", "slot": "轉", "text": "她紅著臉趕快走開，腦子裡卻一直重播。",
     "traits": {"害羞": 2.5, "膽小": 1.5}, "heat": 1, "gives": ["left"]},
    {"id": "e-e-ring", "deck": "erotic", "slot": "合", "text": "男人手上的婚戒反光，她才懂那叫外遇。",
     "needs": ["affair"], "learn": {"kind": "lesson", "text": "知道了外遇是什麼，對戴婚戒的男人多看一眼"}},
    {"id": "e-e-many", "deck": "erotic", "slot": "合", "text": "她回房間把被子蓋過頭，第一次知道原來可以不只兩個人。",
     "learn": {"kind": "first", "text": "第一次知道有三個人一起這種事"}},
    {"id": "d-s-sento", "deck": "first", "slot": "起", "text": "她第一次走進錢湯，櫃台的婆婆看了她一眼。",
     "place": ["sento"], "gives": ["sento"]},
    {"id": "d-c-wash", "deck": "first", "slot": "承", "text": "她直接要跳進池子，被旁邊的阿姨一把拉住。",
     "needs": ["sento"], "gives": ["scolded"]},
    {"id": "d-t-ask", "deck": "first", "slot": "轉", "text": "阿姨比手畫腳教她先坐在小板凳上洗身體。", "needs": ["scolded"], "gives": ["taught"]},
    {"id": "d-e-rule", "deck": "first", "slot": "合", "text": "泡完出來，婆婆遞給她一瓶咖啡牛奶。",
     "needs": ["taught"], "learn": {"kind": "first", "text": "第一次去錢湯，學會先洗身體再泡，泡完要喝咖啡牛奶"}},
])
