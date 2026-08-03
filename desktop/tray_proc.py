"""把 ComfyUI 養在背景:開、關、看還活著沒、把它的輸出收進記錄檔。

三個要點:

1. **不開黑窗**。Windows 上用 CREATE_NO_WINDOW,ComfyUI 的 stdout/stderr 收進
   管線寫檔——這就是「不要有畫面卡在螢幕上」的另一半。
2. **不搶已經開著的那個**。有人手動開了 ComfyUI(或上一輪沒收乾淨),port 上
   有人應答時就標成「外部啟動」,不再開第二份去搶同一張卡的 VRAM。
3. **當掉會自己重開**,但連續快死三次就停手並標紅——一直重開一個開不起來的
   東西,只會把失敗洗掉讓人看不到病灶。
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path

import tray_config as cfgmod

STOPPED = "stopped"
STARTING = "starting"
RUNNING = "running"
EXTERNAL = "external"
ERROR = "error"

STATE_TEXT = {
    STOPPED: "已停止",
    STARTING: "啟動中",
    RUNNING: "執行中",
    EXTERNAL: "外部啟動",
    ERROR: "出問題",
}

CREATE_NO_WINDOW = 0x08000000
LOG_MAX_BYTES = 20_000_000   # 跟原本 bat 的 20MB 一樣;長月連續運轉不會塞爆磁碟
FAST_FAIL_SECONDS = 20       # 開起來不到這麼久就死 = 開不起來,不是跑一跑掛掉
MAX_FAST_FAILS = 3
RESTART_DELAY = 5.0          # bat 的 `timeout /t 5`
POLL_SECONDS = 3.0


def _get_json(url: str, timeout: float = 2.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:  # noqa: S310 (固定 http://127.0.0.1)
            return json.loads(r.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError, TimeoutError):
        return None


def probe(url: str, timeout: float = 2.0):
    """打一支 ComfyUI 的 API 看它在不在。設定視窗的「測試連線」也用這個。"""
    return _get_json(url, timeout)


class ComfyDaemon:
    def __init__(self, cfg: dict, on_change=None):
        self.cfg = cfg
        self.on_change = on_change or (lambda: None)
        self._lock = threading.RLock()
        self._proc: subprocess.Popen | None = None
        self._proc_started_at = 0.0
        self._wanted = False          # 使用者要它活著嗎(自動重開看這個)
        self._fast_fails = 0
        self._restart_at = 0.0        # >0 = 排定幾點要重開
        self._stop_evt = threading.Event()
        self.state = STOPPED
        self.detail = ""
        self.queue_running = 0
        self.queue_pending = 0
        self.lines: deque[str] = deque(maxlen=400)
        self._sup = threading.Thread(target=self._supervise, daemon=True)
        self._sup.start()

    # ── 對外 ────────────────────────────────────────────────────────────
    @property
    def local_url(self) -> str:
        return f"http://127.0.0.1:{self.cfg.get('port', 8188)}"

    def web_url(self) -> str:
        return self.local_url

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "state": self.state,
                "text": STATE_TEXT.get(self.state, self.state),
                "detail": self.detail,
                "queue_running": self.queue_running,
                "queue_pending": self.queue_pending,
                "url": self.local_url,
                "mine": self._proc is not None and self._proc.poll() is None,
            }

    def tail(self, n: int = 200) -> str:
        with self._lock:
            return "\n".join(list(self.lines)[-n:])

    def start(self) -> str:
        """回空字串 = 已送出啟動,否則是給人看的錯誤訊息。"""
        with self._lock:
            if self._proc is not None and self._proc.poll() is None:
                return ""
            if _get_json(f"{self.local_url}/system_stats") is not None:
                self._set(EXTERNAL, f"連接埠 {self.cfg.get('port')} 上已經有 ComfyUI 在跑")
                return ""
            err = cfgmod.check(self.cfg)
            if err:
                self._set(ERROR, err)
                return err
            self._wanted = True
            self._restart_at = 0.0
            return self._spawn()

    def stop(self) -> None:
        with self._lock:
            self._wanted = False
            self._restart_at = 0.0
            proc = self._proc
            self._proc = None
        if proc is not None and proc.poll() is None:
            self._kill_tree(proc)
        self._log("── 使用者按了停止 ──")
        self._set(STOPPED, "")

    def restart(self) -> str:
        self.stop()
        time.sleep(0.5)
        with self._lock:
            self._fast_fails = 0
        return self.start()

    def close(self) -> None:
        """結束常駐程式:順手把自己開的 ComfyUI 帶走,外部啟動的不動。"""
        self._stop_evt.set()
        with self._lock:
            proc, self._proc, self._wanted = self._proc, None, False
        if proc is not None and proc.poll() is None:
            self._kill_tree(proc)

    # ── 內部 ────────────────────────────────────────────────────────────
    def _set(self, state: str, detail: str = "") -> None:
        with self._lock:
            changed = (state, detail) != (self.state, self.detail)
            self.state, self.detail = state, detail
        if changed:
            try:
                self.on_change()
            except Exception:  # 通知失敗不該弄死監看執行緒
                pass

    def _log(self, line: str) -> None:
        line = line.rstrip("\n")
        with self._lock:
            self.lines.append(line)
        try:
            path = cfgmod.log_path(self.cfg)
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists() and path.stat().st_size > LOG_MAX_BYTES:
                path.replace(path.with_name(path.name + ".1"))
            with path.open("a", encoding="utf-8", errors="replace") as f:
                f.write(line + "\n")
        except OSError:
            pass

    def _spawn(self) -> str:
        cmd = cfgmod.build_command(self.cfg)
        self._log(f"── 啟動 {time.strftime('%Y-%m-%d %H:%M:%S')} ──")
        self._log("$ " + " ".join(cmd))
        kwargs: dict = {
            "cwd": self.cfg.get("comfy_dir") or None,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.STDOUT,
            "stdin": subprocess.DEVNULL,
            "text": True,
            "encoding": "utf-8",
            "errors": "replace",
            "bufsize": 1,
        }
        if os.name == "nt":
            kwargs["creationflags"] = CREATE_NO_WINDOW
        try:
            proc = subprocess.Popen(cmd, **kwargs)  # noqa: S603 (指令由設定頁組出來)
        except OSError as e:
            msg = f"開不起來:{e}"
            self._log(msg)
            self._set(ERROR, msg)
            return msg
        with self._lock:
            self._proc = proc
            self._proc_started_at = time.time()
        threading.Thread(target=self._pump, args=(proc,), daemon=True).start()
        self._set(STARTING, "等 ComfyUI 載模型…")
        return ""

    def _pump(self, proc: subprocess.Popen) -> None:
        if proc.stdout is None:
            return
        for line in proc.stdout:
            self._log(line)

    def _kill_tree(self, proc: subprocess.Popen) -> None:
        """ComfyUI 底下還有 torch 開的子行程,只殺父的會留孤兒佔著 VRAM。"""
        if os.name == "nt":
            try:
                subprocess.run(
                    ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                    capture_output=True,
                    creationflags=CREATE_NO_WINDOW,
                    timeout=15,
                )
            except (OSError, subprocess.SubprocessError):
                pass
        else:
            try:
                proc.terminate()
            except OSError:
                pass
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                proc.kill()
            except OSError:
                pass

    def _supervise(self) -> None:
        while not self._stop_evt.wait(POLL_SECONDS):
            try:
                self._tick()
            except Exception as e:  # 監看執行緒死掉 = 圖示從此不會再更新
                self._log(f"[tray] 監看出錯:{e}")

    def _tick(self) -> None:
        with self._lock:
            proc = self._proc
            started = self._proc_started_at
            wanted = self._wanted
        alive = proc is not None and proc.poll() is None

        # 剛死掉:記一筆,決定要不要排重開(bat 的 `restarting in 5s` 那段)
        if proc is not None and not alive:
            code = proc.poll()
            with self._lock:
                self._proc = None
            fast = (time.time() - started) < FAST_FAIL_SECONDS
            self._fast_fails = self._fast_fails + 1 if fast else 0
            self._log(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] ComfyUI 結束,離開碼 {code}")
            if wanted and self.cfg.get("auto_restart", True) and self._fast_fails < MAX_FAST_FAILS:
                self._restart_at = time.time() + RESTART_DELAY
                self._set(ERROR, f"離開碼 {code},{int(RESTART_DELAY)} 秒後自動重開")
                return
            hint = ("連續開不起來,先停手不再重試"
                    if self._fast_fails >= MAX_FAST_FAILS else f"離開碼 {code}")
            self._set(ERROR, f"{hint}(看記錄)")
            return

        # 排定的重開時間到了
        if self._restart_at:
            if not wanted:
                self._restart_at = 0.0
            elif time.time() >= self._restart_at:
                self._restart_at = 0.0
                self._spawn()
            return

        stats = _get_json(f"{self.local_url}/system_stats")
        if stats is None:
            if alive:
                self._set(STARTING, "等 ComfyUI 載模型…")
            elif self.state != ERROR:
                self._set(STOPPED, "")
            return

        q = _get_json(f"{self.local_url}/queue") or {}
        with self._lock:
            self.queue_running = len(q.get("queue_running") or [])
            self.queue_pending = len(q.get("queue_pending") or [])
        vram = ""
        try:
            dev = (stats.get("devices") or [{}])[0]
            free = dev.get("vram_free")
            total = dev.get("vram_total")
            if free and total:
                vram = f"VRAM {free / 2**30:.1f}/{total / 2**30:.1f} GB 可用"
        except (AttributeError, IndexError, TypeError, ValueError):
            pass
        if alive:
            self._fast_fails = 0
            self._set(RUNNING, vram)
        else:
            self._set(EXTERNAL, vram or "這份不是我開的,結束時不會帶走")
