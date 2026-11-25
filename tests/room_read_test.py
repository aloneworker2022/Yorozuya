"""python tests/room_read_test.py — 她在房間上網看文章（server/room_read.py）"""
import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import room_read as rr  # noqa: E402

REPLY = """好，我找到一篇。
<<<READ>>>
標題：京都の紅葉、今週末が見頃
網址：https://example.com/kyoto
重點：京都的楓葉這個週末最漂亮。嵐山跟東福寺人會很多。
感想：我想去看，可是人太多我會煩躁。
<<<END>>>"""


class FakeHermes:
    key = "k"

    def __init__(self):
        self.prompts = []

    @asynccontextmanager
    async def _client(self):
        yield object()

    async def _json(self, c, method, path, body=None):
        assert method == "POST" and path == "/api/sessions"
        return {"session": {"id": "s1"}}

    async def _turn(self, c, sid, prompt, emit):
        assert sid == "s1"
        self.prompts.append(prompt)
        return REPLY


def main():
    got = rr.parse_read(REPLY)
    assert got["title"].startswith("京都") and got["url"] == "https://example.com/kyoto"
    assert "楓葉" in got["gist"] and got["feel"].startswith("我")
    assert rr.parse_read("沒有格式") is None
    assert rr.parse_read("<<<READ>>>\n標題：x\n網址：javascript:alert(1)\n重點：y\n<<<END>>>")["url"] == ""

    assert rr.pick_topic(["天文"], [], rnd=lambda: 0.0) == "天文"
    assert rr.pick_topic([], [], rnd=lambda: 0.0) in rr.TOPIC_FALLBACK

    p = rr.read_prompt("小夜", "楓葉", "傲嬌")
    assert "楓葉" in p and "<<<READ>>>" in p and "成人" in p and "小夜" in p

    fake = FakeHermes()
    out = asyncio.run(rr.read_with_hermes("小夜", "楓葉", "傲嬌", agent=fake))
    assert out["via"] == "hermes" and out["title"].startswith("京都") and fake.prompts
    print("ok - room read")


if __name__ == "__main__":
    main()
