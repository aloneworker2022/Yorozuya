"""本機 Memos 對接（玩家日誌上傳）

Memos 跑在這台機器的 Docker：`neosmemo/memos` 對外 9968（容器內 5230）。
遊戲伺服器跟它同機，所以這裡打 127.0.0.1，不走瀏覽器、也不把 token 送到手機。

Token 解析順序：
  1. 環境變數 MEMOS_TOKEN
  2. ~/.config/cthulhu-note/config.toml
  3. ~/.openclaw/openclaw.json 的 memos-buddy skill env
網址：MEMOS_URL，沒填就 http://127.0.0.1:9968
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import httpx

DEFAULT_URL = "http://127.0.0.1:9968"
_YMD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class MemosError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def memos_url() -> str:
    return (os.environ.get("MEMOS_URL") or DEFAULT_URL).rstrip("/")


def memos_token() -> str:
    t = (os.environ.get("MEMOS_TOKEN") or "").strip()
    if t:
        return t
    t = _token_from_cthulhu()
    if t:
        return t
    return _token_from_openclaw()


def configured() -> bool:
    return bool(memos_token())


def _token_from_cthulhu() -> str:
    p = Path.home() / ".config" / "cthulhu-note" / "config.toml"
    if not p.is_file():
        return ""
    try:
        import tomllib
        data = tomllib.loads(p.read_text(encoding="utf-8"))
        return str((data.get("memos") or {}).get("token") or "").strip()
    except Exception:
        return ""


def _token_from_openclaw() -> str:
    p = Path.home() / ".openclaw" / "openclaw.json"
    if not p.is_file():
        return ""
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return ""
    env = (
        ((data.get("skills") or {}).get("entries") or {})
        .get("memos-buddy", {})
        .get("env")
        or {}
    )
    return str(env.get("MEMOS_TOKEN") or "").strip()


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def format_diary(_ymd: str, text: str) -> str:
    body = (text or "").strip()
    return f"{body}\n\n#yorozuya #日誌\n" if body else "#yorozuya #日誌\n"


def _name_of(memo: dict) -> str:
    return str(memo.get("name") or "")


def status() -> dict:
    url = memos_url()
    token = memos_token()
    if not token:
        return {
            "ok": False,
            "configured": False,
            "url": url,
            "user": None,
            "error": "沒有 Memos token（設 MEMOS_TOKEN，或沿用 cthulhu-note / memos-buddy 的）",
        }
    try:
        r = httpx.get(
            f"{url}/api/v1/auth/sessions/current",
            headers=_headers(token),
            timeout=5,
        )
    except Exception as e:
        return {
            "ok": False,
            "configured": True,
            "url": url,
            "user": None,
            "error": f"連不上 {url}：{e}",
        }
    if r.status_code != 200:
        return {
            "ok": False,
            "configured": True,
            "url": url,
            "user": None,
            "error": f"驗證失敗 HTTP {r.status_code}",
        }
    user = (r.json() or {}).get("user") or {}
    return {
        "ok": True,
        "configured": True,
        "url": url,
        "user": user.get("displayName") or user.get("username") or user.get("name"),
        "error": None,
    }


def _request(method: str, path: str, json_body: dict | None = None) -> dict:
    url = memos_url()
    token = memos_token()
    if not token:
        raise MemosError("沒有 Memos token", status=503)
    try:
        r = httpx.request(
            method,
            f"{url}/api/v1/{path.lstrip('/')}",
            headers=_headers(token),
            json=json_body,
            timeout=10,
        )
    except Exception as e:
        raise MemosError(f"網路錯誤：{e}") from e
    if r.status_code >= 400:
        detail = ""
        try:
            detail = (r.json() or {}).get("message") or r.text[:200]
        except Exception:
            detail = r.text[:200]
        raise MemosError(f"Memos HTTP {r.status_code}: {detail}", status=502)
    if not r.content:
        return {}
    try:
        return r.json()
    except Exception:
        return {}


def upsert_diary(ymd: str, text: str, name: str | None = None) -> dict:
    ymd = (ymd or "").strip()
    if not _YMD_RE.match(ymd):
        raise MemosError("日期格式要 YYYY-MM-DD", status=400)
    content = format_diary(ymd, text)
    if name:
        n = name if name.startswith("memos/") else f"memos/{name}"
        try:
            memo = _request("PATCH", n, {"content": content, "visibility": "PRIVATE"})
            return {"ok": True, "name": _name_of(memo) or n, "created": False}
        except MemosError:
            pass
    memo = _request("POST", "memos", {"content": content, "visibility": "PRIVATE"})
    return {"ok": True, "name": _name_of(memo), "created": True}
