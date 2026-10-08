"""python tests/jp_news_test.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import jp_news  # noqa: E402

SAMPLE = """<?xml version="1.0"?>
<rss><channel>
<item>
  <title>週間天気予報 週前半はぐずつく - ウェザーニュース</title>
  <description>&lt;a href="https://news.google.com/rss/articles/abc"&gt;link&lt;/a&gt;</description>
</item>
<item>
  <title>只是標題沒有來源</title>
  <description>短い要約です</description>
</item>
</channel></rss>
"""


def main():
    assert jp_news.clean_query("  天気  https://evil.example  ") == "天気 evil.example"
    assert len(jp_news.clean_query("あ" * 80)) == 40
    items = jp_news.parse_rss(SAMPLE)
    assert items[0]["title"] == "週間天気予報 週前半はぐずつく"
    assert items[0]["source"] == "ウェザーニュース"
    assert items[0]["summary"] == ""
    assert items[1]["title"] == "只是標題沒有來源"
    assert items[1]["summary"] == "短い要約です"
    assert jp_news.parse_rss("<rss></rss>") == []
    print("ok - jp news parse")


if __name__ == "__main__":
    main()
