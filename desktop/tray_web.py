"""設定介面:本機網頁,不是 tkinter。

**為什麼不用 tkinter**:ComfyUI 攜帶版的 `python_embeded` 是 Windows 的
embeddable 精簡包,裡面**沒有** `_tkinter.pyd` 也沒有 tcl/tk。在那個直譯器上
`import tkinter` 必定失敗;用 pythonw 跑又沒有主控台可以印錯誤,結果就是雙擊
之後什麼都沒發生。所以介面改用「本機小網頁 + 瀏覽器」——標準庫的 http.server
就夠,攜帶版一定跑得動,而且這台本來就是拿來看網頁的。

同一個 socket 兼三個角色:
  1. 單一實例鎖(綁得住 = 沒有別份在跑)
  2. 設定頁 / 記錄頁
  3. 狀態 API(頁面每 2 秒撈一次,顯示的是活的狀態)

只綁 127.0.0.1,而且每次啟動換一組 token:網頁能打 localhost,別的網站
不該能在你不知情時改你的 ComfyUI 設定。
"""

from __future__ import annotations

import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import tray_config as cfgmod
import tray_proc

HOST = "127.0.0.1"
PORT = 53517


PAGE = """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>萬事屋 · ComfyUI 常駐</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:#15121b;color:#e8e4ef;
     font:15px/1.6 "Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#9a90ad;font-size:13px;margin-bottom:20px}
.card{background:#1e1a26;border:1px solid #2e2839;border-radius:10px;
      padding:16px 18px;margin-bottom:16px}
.state{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:600}
.dot{width:12px;height:12px;border-radius:50%;flex:none}
.detail{color:#9a90ad;font-size:13px;margin-top:6px;min-height:20px}
label{display:block;margin:14px 0 4px;font-size:13px;color:#c3bad3}
input[type=text],input[type=number]{width:100%;padding:8px 10px;border-radius:6px;
   border:1px solid #3a3348;background:#141019;color:#e8e4ef;font:inherit}
input[type=number]{width:120px}
.hint{color:#7d7391;font-size:12px;margin-top:4px}
.row{display:flex;gap:16px;flex-wrap:wrap}
.chk{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:14px}
button{padding:8px 16px;border-radius:6px;border:1px solid #3a3348;background:#2a2436;
       color:#e8e4ef;font:inherit;cursor:pointer}
button:hover{background:#352d45}
button.primary{background:#6b4ea8;border-color:#6b4ea8}
button.primary:hover{background:#7d5cc0}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
pre{background:#0e0b13;border:1px solid #2e2839;border-radius:8px;padding:12px;
    overflow:auto;max-height:340px;font-size:12px;line-height:1.5;margin:0;
    white-space:pre-wrap;word-break:break-all}
.cmd{font-size:12px;color:#8fd6a8}
.warn{color:#e8a33e;font-size:13px;margin-top:8px;white-space:pre-wrap}
.err{color:#e8697d}
.tabs{display:flex;gap:6px;margin-bottom:14px}
.tabs button{border-radius:999px}
.tabs button.on{background:#6b4ea8;border-color:#6b4ea8}
</style></head><body><div class="wrap">
<h1>萬事屋 · ComfyUI 常駐</h1>
<div class="sub">畫面上不留視窗,狀態看右下角那顆圖示。這頁關掉不影響 ComfyUI。</div>

<div class="card">
  <div class="state"><span class="dot" id="dot"></span><span id="stext">…</span></div>
  <div class="detail" id="sdetail"></div>
  <div class="bar">
    <button id="btn-toggle">啟動 / 停止</button>
    <button onclick="act('restart')">重新啟動</button>
    <button id="btn-web">開啟 ComfyUI 網頁</button>
  </div>
</div>

<div class="tabs">
  <button id="tab-set" class="on" onclick="tab('set')">設定</button>
  <button id="tab-log" onclick="tab('log')">記錄</button>
</div>

<div class="card" id="pane-set">
  <label>ComfyUI 資料夾</label>
  <input type="text" id="comfy_dir" spellcheck="false">
  <div class="hint">攜帶版根目錄(裡面有 python_embeded\\ 與 ComfyUI\\),或直接是含 main.py 的目錄,兩種都認</div>

  <label>Python(留空 = 自動找)</label>
  <input type="text" id="python_exe" spellcheck="false">
  <div class="hint">攜帶版一定要用 python_embeded 那個,系統 python 沒有裝好的 torch</div>

  <div class="row">
    <div style="flex:1;min-width:200px">
      <label>監聽位址</label>
      <input type="text" id="host" spellcheck="false">
      <div class="hint">0.0.0.0 = RP5 與手機連得到;127.0.0.1 = 只有這台看得到</div>
    </div>
    <div>
      <label>連接埠</label>
      <input type="number" id="port">
    </div>
  </div>

  <label>其他參數</label>
  <input type="text" id="extra_args" spellcheck="false">
  <div class="hint">例 --lowvram。別加 --highvram / --gpu-only,RP5 的 /free 會卸不乾淨</div>

  <div class="chk"><input type="checkbox" id="autostart_comfy"><label for="autostart_comfy" style="margin:0">常駐程式一開就啟動 ComfyUI</label></div>
  <div class="chk"><input type="checkbox" id="auto_restart"><label for="auto_restart" style="margin:0">ComfyUI 當掉時自動重開</label></div>
  <div class="chk"><input type="checkbox" id="start_with_windows"><label for="start_with_windows" style="margin:0">開機時自動啟動這支常駐程式</label></div>

  <label>實際會執行</label>
  <div class="cmd" id="cmd">…</div>
  <div class="warn" id="warn"></div>

  <div class="bar">
    <button class="primary" onclick="save(true)">儲存並重新啟動</button>
    <button onclick="save(false)">只儲存</button>
    <button onclick="load()">重讀</button>
  </div>
</div>

<div class="card" id="pane-log" style="display:none">
  <pre id="log">…</pre>
  <div class="hint" id="logpath"></div>
</div>

<div class="sub" id="cfgpath"></div>
</div>
<script>
const T = new URLSearchParams(location.search).get('t') || '';
const F = ['comfy_dir','python_exe','host','port','extra_args'];
const C = ['autostart_comfy','auto_restart','start_with_windows'];
const COLOR = {stopped:'#8b8b8b',starting:'#e0a33e',running:'#4caf72',
               external:'#4a90d9',error:'#d1495b'};
let webUrl = '';

function api(path, body){
  return fetch(path + '?t=' + encodeURIComponent(T),
    body ? {method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify(body)} : {}).then(r => r.json());
}
function tab(which){
  document.getElementById('pane-set').style.display = which==='set' ? '' : 'none';
  document.getElementById('pane-log').style.display = which==='log' ? '' : 'none';
  document.getElementById('tab-set').className = which==='set' ? 'on' : '';
  document.getElementById('tab-log').className = which==='log' ? 'on' : '';
}
function collect(){
  const o = {};
  F.forEach(k => o[k] = document.getElementById(k).value.trim());
  o.port = parseInt(o.port || '0', 10);
  C.forEach(k => o[k] = document.getElementById(k).checked);
  return o;
}
function load(){
  api('/api/state').then(s => {
    F.forEach(k => document.getElementById(k).value = s.cfg[k]);
    C.forEach(k => document.getElementById(k).checked = !!s.cfg[k]);
    document.getElementById('cfgpath').textContent = '設定檔:' + s.config_path;
    document.getElementById('logpath').textContent = '記錄檔:' + s.log_path;
    paint(s);
  });
}
function paint(s){
  document.getElementById('dot').style.background = COLOR[s.state] || '#8b8b8b';
  document.getElementById('stext').textContent =
    'ComfyUI:' + s.text + (s.queue_total ? '(佇列 ' + s.queue_running + '/' + s.queue_total + ')' : '');
  document.getElementById('sdetail').textContent = s.detail || '';
  document.getElementById('cmd').textContent = s.cmd;
  const w = document.getElementById('warn');
  w.textContent = [s.error, ...(s.risky||[]).map(x => '⚠ ' + x)].filter(Boolean).join('\\n');
  w.className = s.error ? 'warn err' : 'warn';
  document.getElementById('btn-toggle').textContent = s.mine ? '停止 ComfyUI' : '啟動 ComfyUI';
  document.getElementById('log').textContent = s.log || '(還沒有記錄)';
  webUrl = s.url;
}
function act(a){ return api('/api/action', {action:a}).then(paint); }
function save(restart){
  api('/api/save', {cfg:collect(), restart:!!restart}).then(s => { paint(s); load(); });
}
document.getElementById('btn-toggle').onclick = () => act('toggle');
document.getElementById('btn-web').onclick = () => window.open(webUrl, '_blank');
F.forEach(k => document.getElementById(k).addEventListener('input', () =>
  api('/api/preview', {cfg:collect()}).then(paint)));
load();
setInterval(() => api('/api/state').then(paint), 2000);
</script></body></html>
"""


class UI:
    """網頁介面 + 單一實例鎖。app 要提供 cfg / daemon / apply() / quit()。"""

    def __init__(self, app):
        self.app = app
        self.token = secrets.token_urlsafe(16)
        self.httpd = ThreadingHTTPServer((HOST, PORT), self._handler())
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    @property
    def url(self) -> str:
        return f"http://{HOST}:{PORT}/?t={self.token}"

    def close(self) -> None:
        # shutdown() 只停迴圈,socket 還綁著;要 server_close() 才真的放掉那個
        # 連接埠——不放的話「結束再開一次」會被自己的殘骸擋在門外。
        try:
            self.httpd.shutdown()
        except Exception:
            pass
        try:
            self.httpd.server_close()
        except Exception:
            pass

    # ── 狀態 ────────────────────────────────────────────────────────────
    def state(self, cfg: dict | None = None) -> dict:
        """cfg 給值 = 只算那份設定的預覽(使用者還在打字,沒存)。"""
        app = self.app
        s = app.daemon.snapshot()
        shown = cfg if cfg is not None else app.cfg
        try:
            cmd = " ".join(cfgmod.build_command(shown))
        except (OSError, ValueError) as e:
            cmd = f"(組不出指令:{e})"
        return {
            **s,
            "queue_total": s["queue_running"] + s["queue_pending"],
            "cfg": {k: app.cfg.get(k) for k in cfgmod.DEFAULTS},
            "cmd": cmd,
            "error": cfgmod.check(shown),
            "risky": cfgmod.risky(shown.get("extra_args", "")),
            "log": app.daemon.tail(300),
            "config_path": str(cfgmod.CONFIG_PATH),
            "log_path": str(cfgmod.log_path(app.cfg)),
        }

    # ── HTTP ────────────────────────────────────────────────────────────
    def _handler(self):
        ui = self

        class H(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *a):  # 不要每次輪詢都往記錄裡塞一行
                pass

            def _ok(self) -> bool:
                """token 對不對。別的網站也打得到 127.0.0.1,不能只靠綁本機。"""
                from urllib.parse import parse_qs, urlparse

                q = parse_qs(urlparse(self.path).query)
                if (q.get("t") or [""])[0] != ui.token:
                    self._send(403, b"forbidden", "text/plain; charset=utf-8")
                    return False
                origin = self.headers.get("Origin")
                if origin and not origin.startswith(f"http://{HOST}:{PORT}"):
                    self._send(403, b"bad origin", "text/plain; charset=utf-8")
                    return False
                return True

            def _send(self, code: int, body: bytes, ctype: str) -> None:
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                try:
                    self.wfile.write(body)
                except OSError:
                    pass

            def _json(self, obj) -> None:
                self._send(200, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                           "application/json; charset=utf-8")

            def _body(self) -> dict:
                n = int(self.headers.get("Content-Length") or 0)
                if not n:
                    return {}
                try:
                    return json.loads(self.rfile.read(n).decode("utf-8"))
                except ValueError:
                    return {}

            def do_GET(self):
                if not self._ok():
                    return
                path = self.path.split("?")[0]
                if path == "/":
                    self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
                elif path == "/api/state":
                    self._json(ui.state())
                else:
                    self._send(404, b"not found", "text/plain; charset=utf-8")

            def do_POST(self):
                if not self._ok():
                    return
                path = self.path.split("?")[0]
                body = self._body()
                if path == "/api/preview":
                    self._json(ui.state(cfg=ui.app.merged(body.get("cfg") or {})))
                elif path == "/api/save":
                    ui.app.apply(body.get("cfg") or {}, restart=bool(body.get("restart")))
                    self._json(ui.state())
                elif path == "/api/action":
                    ui.app.action(str(body.get("action") or ""))
                    self._json(ui.state())
                else:
                    self._send(404, b"not found", "text/plain; charset=utf-8")

        return H


def probe_running() -> bool:
    """已經有一份常駐程式在跑嗎(拿來當單一實例判斷的輔助)。"""
    return tray_proc.probe(f"http://{HOST}:{PORT}/", timeout=0.8) is not None
