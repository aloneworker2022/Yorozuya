"""萬事屋 · ComfyUI 常駐(系統匣版)——取代 start_comfy.bat。

副檔名是 `.pyw` 不是 `.py`:Windows 用 pythonw 開它,**從頭到尾不會有主控台視窗**。
桌面上只剩右下角一顆圖示,顏色就是狀態:

    灰 停止   黃 啟動中   綠 執行中   藍 外部啟動的   紅 出問題

左鍵按圖示 = 開設定;右鍵 = 完整選單(啟動/停止/重開、開網頁、看記錄、結束)。

為什麼要分執行緒:pystray 的訊息迴圈與 tkinter 的 mainloop 不能擠在同一條。
tkinter 佔主執行緒(所有視窗都必須在這裡開),托盤跑背景執行緒,選單點下去只是
把一個 callable 丟進 `_pump`,再由主執行緒取出來執行——tkinter 從別條執行緒碰
會隨機當掉,而且當掉的樣子每次都不一樣。
"""

from __future__ import annotations

import queue
import socket
import sys
import threading
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import messagebox

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tray_config as cfgmod   # noqa: E402
import tray_proc               # noqa: E402
import tray_ui                 # noqa: E402

# 同一台只准開一份:綁一個 loopback 連接埠當鎖。用檔案鎖的話,當掉沒清乾淨
# 就再也開不起來;連接埠是行程一死就自動還回去的。
LOCK_PORT = 53517

STATE_COLOR = {
    tray_proc.STOPPED: (150, 150, 150),
    tray_proc.STARTING: (224, 163, 62),
    tray_proc.RUNNING: (76, 175, 114),
    tray_proc.EXTERNAL: (74, 144, 217),
    tray_proc.ERROR: (209, 73, 91),
}


def single_instance() -> socket.socket | None:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", LOCK_PORT))
        s.listen(1)
        return s
    except OSError:
        s.close()
        return None


def make_image(state: str):
    """畫一顆調色盤。托盤只有 16×16,細節畫了也看不到,靠顏色講狀態。"""
    from PIL import Image, ImageDraw

    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = STATE_COLOR.get(state, (150, 150, 150))
    dark = tuple(max(0, c - 70) for c in color)
    d.ellipse((3, 3, size - 4, size - 4), fill=color + (255,), outline=dark + (255,), width=3)
    # 顏料孔:三個小洞 + 右下拇指孔,遠看就知道是調色盤不是紅綠燈
    for cx, cy in ((22, 20), (38, 18), (46, 32)):
        d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=dark + (255,))
    d.ellipse((26, 38, 44, 56), fill=(0, 0, 0, 0), outline=dark + (255,), width=3)
    return img


class TrayApp:
    def __init__(self, root: tk.Tk):
        import pystray

        self.pystray = pystray
        self.root = root
        self._pump: queue.Queue = queue.Queue()

        self.cfg = cfgmod.load()
        if not self.cfg.get("comfy_dir"):
            # 第一次開:跟 bat 一樣自己找,找到就直接能用,不必先進設定頁
            guessed = cfgmod.guess_comfy_dir()
            if guessed:
                self.cfg["comfy_dir"] = guessed
                cfgmod.save(self.cfg)

        self.daemon = tray_proc.ComfyDaemon(self.cfg, on_change=self._on_state)
        self.icon = pystray.Icon(
            "yorozuya-comfy",
            make_image(tray_proc.STOPPED),
            "萬事屋 · ComfyUI",
            menu=self._menu(),
        )
        self._last_state = tray_proc.STOPPED

        root.after(120, self._drain)
        threading.Thread(target=self.icon.run, daemon=True).start()

        if self.cfg.get("autostart_comfy", True):
            err = self.daemon.start()
            if err:
                self.post(lambda: self._first_run_hint(err))

    # ── 主執行緒佇列 ────────────────────────────────────────────────────
    def post(self, fn) -> None:
        self._pump.put(fn)

    def _drain(self) -> None:
        while True:
            try:
                fn = self._pump.get_nowait()
            except queue.Empty:
                break
            try:
                fn()
            except Exception as e:  # 一個選單動作出錯不該把常駐程式帶走
                messagebox.showerror("出錯了", str(e))
        self.root.after(120, self._drain)

    # ── 托盤 ────────────────────────────────────────────────────────────
    # 選單的 text / checked / action 一律寫成 `*_`:pystray 依參數個數決定要不要
    # 把 (icon, item) 傳進來,收 *_ 兩種叫法都接得住。
    def _status_text(self, *_) -> str:
        s = self.daemon.snapshot()
        line = f"ComfyUI:{s['text']}"
        if s["queue_running"] or s["queue_pending"]:
            line += f"(佇列 {s['queue_running']}/{s['queue_running'] + s['queue_pending']})"
        return line

    def _run_text(self, *_) -> str:
        return "停止 ComfyUI" if self.daemon.snapshot()["mine"] else "啟動 ComfyUI"

    def _menu(self):
        p = self.pystray
        return p.Menu(
            p.MenuItem(self._status_text, None, enabled=False),
            p.MenuItem(lambda *_: self.daemon.snapshot()["detail"] or " ", None, enabled=False),
            p.Menu.SEPARATOR,
            p.MenuItem("設定…", lambda *_: self.post(self._settings), default=True),
            p.MenuItem("開啟 ComfyUI 網頁", lambda *_: self.post(self._open_web)),
            p.MenuItem("檢視記錄", lambda *_: self.post(self._logs)),
            p.Menu.SEPARATOR,
            p.MenuItem(self._run_text, lambda *_: self.post(self._toggle)),
            p.MenuItem("重新啟動 ComfyUI", lambda *_: self.post(self._restart)),
            p.MenuItem(
                "開機時自動啟動",
                lambda *_: self.post(self._toggle_boot),
                checked=lambda *_: bool(self.cfg.get("start_with_windows")),
                enabled=cfgmod.autostart_supported(),
            ),
            p.Menu.SEPARATOR,
            p.MenuItem("結束(連 ComfyUI 一起關)", lambda *_: self.post(self._quit)),
        )

    def _on_state(self) -> None:
        """監看執行緒呼叫:換圖示顏色、更新滑鼠提示。"""
        s = self.daemon.snapshot()
        try:
            if s["state"] != self._last_state:
                self.icon.icon = make_image(s["state"])
                self._last_state = s["state"]
            tip = f"萬事屋 · ComfyUI — {s['text']}"
            if s["detail"]:
                tip += f"\n{s['detail']}"
            self.icon.title = tip
            self.icon.update_menu()
        except Exception:
            pass

    # ── 選單動作(都在主執行緒上跑)──────────────────────────────────
    def _settings(self) -> None:
        tray_ui.SettingsWindow.show(self.root, self.daemon, self._apply)

    def _logs(self) -> None:
        tray_ui.LogWindow.show(self.root, self.daemon)

    def _open_web(self) -> None:
        webbrowser.open(self.daemon.web_url())

    def _toggle(self) -> None:
        if self.daemon.snapshot()["mine"]:
            self.daemon.stop()
        else:
            err = self.daemon.start()
            if err:
                messagebox.showerror("啟動失敗", err)
                self._settings()

    def _restart(self) -> None:
        err = self.daemon.restart()
        if err:
            messagebox.showerror("重新啟動失敗", err)

    def _toggle_boot(self) -> None:
        want = not bool(self.cfg.get("start_with_windows"))
        err = cfgmod.set_autostart(want, Path(__file__).resolve())
        if err:
            messagebox.showerror("開機自動啟動", err)
            return
        self.cfg["start_with_windows"] = want
        cfgmod.save(self.cfg)
        self.icon.update_menu()

    def _apply(self, new_cfg: dict) -> None:
        """設定頁按了儲存。影響指令的欄位動過,就問要不要現在重開。"""
        keys = ("comfy_dir", "python_exe", "host", "port", "extra_args")
        changed = any(self.cfg.get(k) != new_cfg.get(k) for k in keys)
        boot_changed = bool(self.cfg.get("start_with_windows")) != bool(
            new_cfg.get("start_with_windows"))

        self.cfg.update(new_cfg)
        cfgmod.save(self.cfg)
        self.daemon.cfg = self.cfg

        if boot_changed:
            err = cfgmod.set_autostart(bool(self.cfg["start_with_windows"]), Path(__file__).resolve())
            if err:
                messagebox.showerror("開機自動啟動", err)
                self.cfg["start_with_windows"] = cfgmod.autostart_enabled()
                cfgmod.save(self.cfg)

        if changed and self.daemon.snapshot()["mine"]:
            if messagebox.askyesno("設定已儲存", "要現在重新啟動 ComfyUI 套用嗎?"):
                self._restart()
        elif changed and not self.daemon.snapshot()["mine"] and self.cfg.get("autostart_comfy"):
            self.daemon.start()
        self.icon.update_menu()

    def _first_run_hint(self, err: str) -> None:
        messagebox.showwarning(
            "還差一步",
            f"{err}\n\n把這支程式放進 ComfyUI_windows_portable 資料夾就免設定,"
            "或在設定視窗裡指定資料夾。",
        )
        self._settings()

    def _quit(self) -> None:
        self.daemon.close()
        try:
            self.icon.stop()
        except Exception:
            pass
        self.root.quit()


def main() -> int:
    root = tk.Tk()
    root.withdraw()   # 主視窗永遠不出現,這就是「不要有畫面卡在螢幕上」

    lock = single_instance()
    if lock is None:
        messagebox.showinfo("萬事屋 · ComfyUI", "已經在跑了,看右下角的圖示。")
        return 0

    try:
        import pystray  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        messagebox.showerror(
            "少了套件",
            "需要 pystray 與 Pillow:\n\n"
            "  python_embeded\\python.exe -m pip install pystray pillow\n\n"
            "(或用系統 python 跑這支程式時,對那個 python 裝)",
        )
        return 1

    app = TrayApp(root)
    try:
        root.mainloop()
    finally:
        app.daemon.close()
        lock.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
