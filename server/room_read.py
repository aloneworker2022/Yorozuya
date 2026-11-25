"""她在房間（家）上網看文章（2026-11-25 使用者，PLAN §13.0 第 7 項：「在家裡用 hermes 上網看文章」）。

手機在她做「滑手機」那類房間活動時叫一次（最多兩小時一次）：照她的興趣挑一個主題 →
有 Hermes（DESK_AGENT=hermes）就叫 Hermes 上網找一篇、打開讀完、寫重點和她的一句感想；
沒有 Hermes 或失敗 → 用日本新聞搜尋（jp_news）拿一篇的標題當她看到的東西。
結果交回手機：記成她的記憶（上網），聊天時她會提。這裡只放純函式＋呼叫；工作排程在 main.py。
"""
from __future__ import annotations

import asyncio
import random
import re

READ_TIMEOUT_S = 300
TOPIC_FALLBACK = ("美食", "貓", "電影", "音樂", "時尚", "旅行", "占卜", "便利商店新商品", "天氣", "動漫")
_BLOCK = re.compile(r"<<<READ>>>(.*?)<<<END>>>", re.S)


def pick_topic(hobbies=None, likes=None, rnd=None) -> str:
    """她的興趣、喜歡的東西裡挑一個；都沒有就從常見主題挑。"""
    roll = rnd if rnd is not None else random.random
    pool = [str(x).strip() for x in list(hobbies or []) + list(likes or []) if str(x or "").strip()]
    if not pool:
        pool = list(TOPIC_FALLBACK)
    return pool[int(float(roll()) * len(pool)) % len(pool)][:30]


def read_prompt(name: str, topic: str, persona: str = "") -> str:
    who = f"你是「{name or '她'}」" + (f"（{persona}）" if persona else "") + "。"
    return "\n".join([
        who + "你在家裡閒著，用手機上網看文章。",
        f"請用你的搜尋／瀏覽工具，找一篇最近的、跟「{topic}」有關的文章（日文、中文、英文都可以），打開讀完。",
        "不要找成人內容。不要做別的事、不要開使魔、不要寫檔案。",
        "讀完只輸出下面這一段（中間用台灣口語的繁體中文寫），不要別的字：",
        "<<<READ>>>",
        "標題：文章的標題",
        "網址：文章的網址",
        "重點：2～3 句，這篇在講什麼",
        "感想：用「我」寫一句你自己的感想（照你的個性）",
        "<<<END>>>",
    ])


def parse_read(text: str) -> dict | None:
    """Hermes 的回答 → {title, url, gist, feel}；格式不對回 None。"""
    m = _BLOCK.search(str(text or ""))
    body = m.group(1) if m else str(text or "")
    out = {}
    for key, zh in (("title", "標題"), ("url", "網址"), ("gist", "重點"), ("feel", "感想")):
        mm = re.search(rf"{zh}[:：]\s*(.+)", body)
        if mm:
            out[key] = mm.group(1).strip()[:300]
    if not out.get("title") or not (out.get("gist") or out.get("feel")):
        return None
    if out.get("url") and not re.match(r"https?://", out["url"]):
        out["url"] = ""
    return out


async def read_with_hermes(name: str, topic: str, persona: str = "", agent=None) -> dict | None:
    """叫 Hermes 讀一篇（一個新的 session、一輪）。失敗回 None。agent：測試用。"""
    import desk_hermes
    ag = agent or desk_hermes.HermesAgent()
    if not ag.key:
        return None
    async with ag._client() as c:
        s = await ag._json(c, "POST", "/api/sessions", {})
        sid = (s.get("session") or {}).get("id") or s.get("id") or s.get("session_id") or ""
        if not sid:
            return None
        out = await asyncio.wait_for(ag._turn(c, sid, read_prompt(name, topic, persona), lambda *a: None), timeout=READ_TIMEOUT_S)
    got = parse_read(out)
    if got:
        got["via"] = "hermes"
    return got


async def read_from_news(topic: str) -> dict | None:
    """沒有 Hermes：日本新聞搜尋拿一篇的標題（不抓內文）。"""
    import jp_news
    res = await jp_news.search_jp_news(topic, limit=3)
    items = res.get("items") or []
    if not items:
        return None
    it = items[0]
    title = str(it.get("title") or "").strip()
    if not title:
        return None
    return {"title": title[:200], "url": "", "gist": "", "feel": "", "source": str(it.get("source") or ""), "via": "news"}


async def read_one(name: str, topic: str, persona: str = "", use_hermes: bool = True) -> dict:
    """讀一篇：先 Hermes，不行退新聞；都不行回 {ok: False}。"""
    got = None
    err = ""
    if use_hermes:
        try:
            got = await read_with_hermes(name, topic, persona)
        except Exception as e:   # Hermes 沒開、key 不對、逾時：退新聞
            err = str(e) or type(e).__name__
    if not got:
        try:
            got = await read_from_news(topic)
        except Exception as e:
            err = err or str(e) or type(e).__name__
    if not got:
        return {"ok": False, "topic": topic, "error": err or "沒找到文章"}
    return {"ok": True, "topic": topic, **got}
