"""萬事屋 · ComfyUI 常駐(系統匣版)——取代 start_comfy.bat。

副檔名是 `.pyw`:Windows 用 pythonw 開它,**從頭到尾不會有主控台視窗**。
桌面上只剩右下角一顆圖示,顏色就是狀態:

    灰 停止   黃 啟動中   綠 執行中   藍 外部啟動的   紅 出問題

左鍵按圖示 = 開設定頁(瀏覽器);右鍵 = 完整選單。

**這支程式不用 tkinter**,因為 ComfyUI 攜帶版的 `python_embeded` 是 Windows
embeddable 精簡包,裡面根本沒有 tkinter。介面走本機網頁(tray_web),
錯誤提示走 Windows 原生 MessageBox(ctypes,標準庫就有)。

pythonw 沒有主控台,所以**任何一個沒接住的例外都會變成靜靜地什麼都沒發生**。
下面每一段都包在 try 裡,出事一定跳一個框、一定寫 tray.log——寧可醜,
也不要再有「雙擊之後什麼都沒有」。
"""

from __future__ import annotations

import ctypes
import sys
import threading
import traceback
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tray_config as cfgmod   # noqa: E402
import tray_proc               # noqa: E402
import tray_web                # noqa: E402

STATE_COLOR = {
    tray_proc.STOPPED: (150, 150, 150),
    tray_proc.STARTING: (224, 163, 62),
    tray_proc.RUNNING: (76, 175, 114),
    tray_proc.EXTERNAL: (74, 144, 217),
    tray_proc.ERROR: (209, 73, 91),
}


def msgbox(text: str, title: str = "萬事屋 · ComfyUI", icon: int = 0x40) -> None:
    """原生 MessageBox。不依賴任何要另外裝的東西——最後一道能說話的管道。"""
    try:
        ctypes.windll.user32.MessageBoxW(None, text, title, icon)  # type: ignore[attr-defined]
    except Exception:
        print(f"{title}: {text}", file=sys.stderr)


def crash_log(text: str) -> Path | None:
    """把 traceback 寫進檔案。設定目錄一定寫得進去,不必先知道 ComfyUI 在哪。"""
    try:
        cfgmod.config_dir().mkdir(parents=True, exist_ok=True)
        p = cfgmod.config_dir() / "tray.log"
        with p.open("a", encoding="utf-8") as f:
            f.write(text + "\n")
        return p
    except OSError:
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
    # 顏料孔:三個小洞 + 拇指孔,遠看認得出是調色盤,不是紅綠燈
    for cx, cy in ((22, 20), (38, 18), (46, 32)):
        d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=dark + (255,))
    d.ellipse((26, 38, 44, 56), fill=(0, 0, 0, 0), outline=dark + (255,), width=3)
    return img


class TrayApp:
    def __init__(self, ui: tray_web.UI):
        import pystray

        self.pystray = pystray
        self.ui = ui
        ui.app = self

        self.cfg = cfgmod.load()
        if not self.cfg.get("comfy_dir"):
            # 第一次開:跟 bat 一樣自己找,找到就直接能用,不必先進設定頁
            guessed = cfgmod.guess_comfy_dir()
            if guessed:
                self.cfg["comfy_dir"] = guessed
                cfgmod.save(self.cfg)

        self.daemon = tray_proc.ComfyDaemon(self.cfg, on_change=self._on_state)
        self._last_state = tray_proc.STOPPED
        self.icon = pystray.Icon(
            "yorozuya-comfy",
            make_image(tray_proc.STOPPED),
            "萬事屋 · ComfyUI",
            menu=self._menu(),
        )

    def run(self) -> None:
        if self.cfg.get("autostart_comfy", True):
            err = self.daemon.start()
            if err:
                threading.Timer(0.5, lambda: self._first_run_hint(err)).start()
        self.icon.run()   # 佔住主執行緒直到結束

    # ── 給網頁介面呼叫 ─────────────────────────────────────────────────
    def merged(self, partial: dict) -> dict:
        return {**self.cfg, **{k: v for k, v in partial.items() if k in cfgmod.DEFAULTS}}

    def apply(self, partial: dict, restart: bool = False) -> None:
        new = self.merged(partial)
        boot_changed = bool(self.cfg.get("start_with_windows")) != bool(new["start_with_windows"])
        self.cfg.update(new)
        cfgmod.save(self.cfg)
        self.daemon.cfg = self.cfg
        if boot_changed:
            err = cfgmod.set_autostart(bool(self.cfg["start_with_windows"]),
                                       Path(__file__).resolve())
            if err:
                msgbox(err, "開機自動啟動", 0x30)
                self.cfg["start_with_windows"] = cfgmod.autostart_enabled()
                cfgmod.save(self.cfg)
        if restart:
            self.daemon.restart()
        self._refresh_menu()

    def action(self, what: str) -> None:
        if what == "toggle":
            self._toggle()
        elif what == "start":
            self.daemon.start()
        elif what == "stop":
            self.daemon.stop()
        elif what == "restart":
            self.daemon.restart()
        elif what == "quit":
            self._quit()
        self._refresh_menu()

    # ── 托盤 ────────────────────────────────────────────────────────────
    # text / checked / action 一律收 `*_`:pystray 依參數個數決定要不要把
    # (icon, item) 傳進來,收 *_ 兩種叫法都接得住。
    def _status_text(self, *_) -> str:
        s = self.daemon.snapshot()
        line = f"ComfyUI:{s['text']}"
        total = s["queue_running"] + s["queue_pending"]
        if total:
            line += f"(佇列 {s['queue_running']}/{total})"
        return line

    def _run_text(self, *_) -> str:
        return "停止 ComfyUI" if self.daemon.snapshot()["mine"] else "啟動 ComfyUI"

    def _menu(self):
        p = self.pystray
        return p.Menu(
            p.MenuItem(self._status_text, None, enabled=False),
            p.MenuItem(lambda *_: self.daemon.snapshot()["detail"] or " ", None, enabled=False),
            p.Menu.SEPARATOR,
            p.MenuItem("設定 / 狀態…", lambda *_: self._safe(self._settings), default=True),
            p.MenuItem("開啟 ComfyUI 網頁", lambda *_: self._safe(self._open_web)),
            p.Menu.SEPARATOR,
            p.MenuItem(self._run_text, lambda *_: self._safe(self._toggle)),
            p.MenuItem("重新啟動 ComfyUI", lambda *_: self._safe(self.daemon.restart)),
            p.MenuItem(
                "開機時自動啟動",
                lambda *_: self._safe(self._toggle_boot),
                checked=lambda *_: bool(self.cfg.get("start_with_windows")),
                enabled=cfgmod.autostart_supported(),
            ),
            p.Menu.SEPARATOR,
            p.MenuItem("結束(連 ComfyUI 一起關)", lambda *_: self._safe(self._quit)),
        )

    def _safe(self, fn) -> None:
        """選單動作出錯只該跳個框,不該把常駐程式帶走。"""
        try:
            fn()
        except Exception:
            tb = traceback.format_exc()
            crash_log(tb)
            msgbox(tb, "選單動作出錯", 0x10)

    def _refresh_menu(self) -> None:
        try:
            self.icon.update_menu()
        except Exception:
            pass

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

    # ── 動作 ────────────────────────────────────────────────────────────
    def _settings(self) -> None:
        webbrowser.open(self.ui.url)

    def _open_web(self) -> None:
        webbrowser.open(self.daemon.web_url())

    def _toggle(self) -> None:
        if self.daemon.snapshot()["mine"]:
            self.daemon.stop()
        else:
            err = self.daemon.start()
            if err:
                msgbox(f"{err}\n\n開設定頁改。", "啟動失敗", 0x30)
                self._settings()

    def _toggle_boot(self) -> None:
        want = not bool(self.cfg.get("start_with_windows"))
        err = cfgmod.set_autostart(want, Path(__file__).resolve())
        if err:
            msgbox(err, "開機自動啟動", 0x30)
            return
        self.cfg["start_with_windows"] = want
        cfgmod.save(self.cfg)
        self._refresh_menu()

    def _first_run_hint(self, err: str) -> None:
        msgbox(
            f"{err}\n\n把這支程式放進 ComfyUI_windows_portable 資料夾就免設定,"
            "或在設定頁指定資料夾。\n\n接著會幫你開設定頁。",
            "還差一步", 0x30,
        )
        self._settings()

    def _quit(self) -> None:
        self.daemon.close()
        self.ui.close()
        try:
            self.icon.stop()
        except Exception:
            pass


def main() -> int:
    # 1. 單一實例:綁得住那個 port 就是沒有別份在跑。用 port 不用檔案鎖——
    #    檔案鎖當掉沒清乾淨就再也開不起來,port 是行程一死就自動還回去。
    try:
        ui = tray_web.UI(app=None)
    except OSError:
        if tray_web.probe_running():
            msgbox("已經在跑了,看右下角的圖示。\n(圖示不見的話從工作列的「顯示隱藏的圖示」拉出來)")
            return 0
        msgbox(f"連接埠 {tray_web.PORT} 被別的程式佔用,設定頁開不起來。", icon=0x10)
        return 1

    # 2. 缺套件:講清楚裝哪個 python。攜帶版沒有 tkinter,所以這裡只需要
    #    pystray 與 Pillow,兩個都是純 pip 裝得起來的。
    try:
        import pystray  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        ui.close()
        msgbox(
            f"少了套件:{e}\n\n"
            "雙擊 install_deps.bat 就會裝到攜帶版的 python,或手動:\n"
            "  python_embeded\\python.exe -m pip install pystray pillow",
            "萬事屋 · ComfyUI", 0x10,
        )
        return 1

    app = TrayApp(ui)
    try:
        app.run()
    finally:
        app.daemon.close()
        ui.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except BaseException:
        tb = traceback.format_exc()
        p = crash_log(tb)
        msgbox(f"{tb}\n\n記錄:{p}", "萬事屋 · ComfyUI 掛了", 0x10)
        sys.exit(1)
