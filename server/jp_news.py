"""日本新聞搜尋。

只打 Google News 的公開 RSS，不接受呼叫端傳來的網址。
回標題與來源，不抓內文。
"""

import html
import re
from urllib.parse import urlencode

import httpx

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
NEWS_RSS = "https://news.google.com/rss/search"


def clean_query(raw: str) -> str:
    text = _WS.sub(" ", str(raw or "")).strip()
    text = text.replace("https://", "").replace("http://", "")
    return text[:40]


def strip_html(raw: str) -> str:
    text = html.unescape(_TAG.sub(" ", str(raw or "")))
    return _WS.sub(" ", text).strip()


def split_source(title: str) -> tuple[str, str]:
    if " - " not in title:
        return title, ""
    head, source = title.rsplit(" - ", 1)
    head, source = head.strip(), source.strip()
    if not head or len(source) > 40:
        return title, ""
    return head, source


def parse_rss(xml_text: str, limit: int = 5) -> list[dict]:
    import xml.etree.ElementTree as ET

    root = ET.fromstring(xml_text)
    items = []
    for item in root.iter("item"):
        raw_title = strip_html(item.findtext("title") or "")
        if not raw_title:
            continue
        title, source = split_source(raw_title[:180])
        raw_desc = item.findtext("description") or ""
        summary = strip_html(raw_desc)
        if summary.startswith("http") or "news.google.com" in raw_desc or summary.lower() == "link":
            summary = ""
        items.append({
            "title": title[:120],
            "source": source[:40],
            "summary": summary[:160],
        })
        if len(items) >= limit:
            break
    return items


async def search_jp_news(query: str, limit: int = 5) -> dict:
    q = clean_query(query)
    if not q:
        return {"ok": False, "query": "", "items": []}
    url = NEWS_RSS + "?" + urlencode({"q": q, "hl": "ja", "gl": "JP", "ceid": "JP:ja"})
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Yorozuya/1.0"})
            resp.raise_for_status()
        items = parse_rss(resp.text, limit)
    except Exception:
        return {"ok": False, "query": q, "items": []}
    return {"ok": bool(items), "query": q, "items": items}
