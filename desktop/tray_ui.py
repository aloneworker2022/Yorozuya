"""設定視窗與記錄視窗(tkinter,標準函式庫就有,不用再裝東西)。

只有按了托盤選單才會出現視窗——平常桌面上什麼都沒有,這是這次改版的重點。
所有 tkinter 呼叫都必須在主執行緒;托盤那邊的點擊是丟進佇列再由主執行緒取出
(見 comfy_tray.pyw 的 pump),這裡可以當作自己一定在主執行緒上。
"""

from __future__ import annotations

import os
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import tray_config as cfgmod
import tray_proc

PAD = {"padx": 8, "pady": 4}


def _open_in_explorer(path: Path) -> None:
    try:
        if os.name == "nt":
            os.startfile(str(path))  # noqa: S606
        elif sys.platform == "darwin":
            subprocess.run(["open", str(path)], check=False)
        else:
            subprocess.run(["xdg-open", str(path)], check=False)
    except OSError:
        pass


class SettingsWindow:
    """同時只開一個;再按一次「設定」是把既有的那個拉到最前面。"""

    _open: "SettingsWindow | None" = None

    @classmethod
    def show(cls, root: tk.Tk, daemon: tray_proc.ComfyDaemon, on_save) -> None:
        if cls._open is not None and cls._open.win.winfo_exists():
            cls._open.win.deiconify()
            cls._open.win.lift()
            cls._open.win.focus_force()
            return
        cls._open = cls(root, daemon, on_save)

    def __init__(self, root: tk.Tk, daemon: tray_proc.ComfyDaemon, on_save):
        self.daemon = daemon
        self.on_save = on_save
        cfg = dict(daemon.cfg)

        self.win = win = tk.Toplevel(root)
        win.title("萬事屋 · ComfyUI 常駐設定")
        win.resizable(False, False)
        win.protocol("WM_DELETE_WINDOW", self._close)

        self.v_dir = tk.StringVar(value=cfg.get("comfy_dir", ""))
        self.v_py = tk.StringVar(value=cfg.get("python_exe", ""))
        self.v_host = tk.StringVar(value=cfg.get("host", "0.0.0.0"))
        self.v_port = tk.StringVar(value=str(cfg.get("port", 8188)))
        self.v_extra = tk.StringVar(value=cfg.get("extra_args", ""))
        self.v_auto = tk.BooleanVar(value=bool(cfg.get("autostart_comfy", True)))
        self.v_restart = tk.BooleanVar(value=bool(cfg.get("auto_restart", True)))
        self.v_boot = tk.BooleanVar(value=bool(cfg.get("start_with_windows", False)))

        frm = ttk.Frame(win)
        frm.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)

        r = 0
        ttk.Label(frm, text="ComfyUI 資料夾").grid(row=r, column=0, sticky="e", **PAD)
        e = ttk.Entry(frm, textvariable=self.v_dir, width=48)
        e.grid(row=r, column=1, sticky="we", **PAD)
        ttk.Button(frm, text="瀏覽…", command=self._pick_dir).grid(row=r, column=2, **PAD)
        r += 1
        ttk.Label(frm, text="裡面要有 main.py", foreground="#888").grid(
            row=r, column=1, sticky="w", padx=8
        )
        r += 1

        ttk.Label(frm, text="Python").grid(row=r, column=0, sticky="e", **PAD)
        ttk.Entry(frm, textvariable=self.v_py, width=48).grid(row=r, column=1, sticky="we", **PAD)
        ttk.Button(frm, text="瀏覽…", command=self._pick_py).grid(row=r, column=2, **PAD)
        r += 1
        ttk.Label(frm, text="留空 = 自動找(攜帶版的 python_embeded → venv → 系統)",
                  foreground="#888").grid(row=r, column=1, sticky="w", padx=8)
        r += 1

        ttk.Label(frm, text="監聽位址").grid(row=r, column=0, sticky="e", **PAD)
        ttk.Entry(frm, textvariable=self.v_host, width=20).grid(row=r, column=1, sticky="w", **PAD)
        r += 1
        ttk.Label(frm, text="0.0.0.0 = 讓 RP5 / 手機連得到;127.0.0.1 = 只有這台自己看得到",
                  foreground="#888").grid(row=r, column=1, sticky="w", padx=8)
        r += 1

        ttk.Label(frm, text="連接埠").grid(row=r, column=0, sticky="e", **PAD)
        ttk.Entry(frm, textvariable=self.v_port, width=10).grid(row=r, column=1, sticky="w", **PAD)
        r += 1

        ttk.Label(frm, text="其他參數").grid(row=r, column=0, sticky="e", **PAD)
        ttk.Entry(frm, textvariable=self.v_extra, width=48).grid(row=r, column=1, sticky="we", **PAD)
        r += 1
        ttk.Label(frm, text="例:--lowvram。別加 --highvram / --gpu-only,GPU 換班會失效",
                  foreground="#888").grid(row=r, column=1, sticky="w", padx=8)
        r += 1

        ttk.Checkbutton(frm, text="常駐程式一開就啟動 ComfyUI", variable=self.v_auto).grid(
            row=r, column=1, sticky="w", **PAD)
        r += 1
        ttk.Checkbutton(frm, text="ComfyUI 當掉時自動重開", variable=self.v_restart).grid(
            row=r, column=1, sticky="w", **PAD)
        r += 1
        cb = ttk.Checkbutton(frm, text="開機時自動啟動這支常駐程式", variable=self.v_boot)
        cb.grid(row=r, column=1, sticky="w", **PAD)
        if not cfgmod.autostart_supported():
            cb.state(["disabled"])
        r += 1

        ttk.Separator(frm, orient="horizontal").grid(row=r, column=0, columnspan=3, sticky="we", pady=8)
        r += 1

        ttk.Label(frm, text="實際會執行").grid(row=r, column=0, sticky="ne", **PAD)
        self.preview = tk.Text(frm, height=3, width=58, wrap="word")
        self.preview.grid(row=r, column=1, columnspan=2, sticky="we", **PAD)
        self.preview.configure(state="disabled", background="#f4f4f4")
        r += 1

        self.msg = ttk.Label(frm, text="", foreground="#a33", wraplength=520, justify="left")
        self.msg.grid(row=r, column=1, columnspan=2, sticky="w", padx=8)
        r += 1

        bar = ttk.Frame(frm)
        bar.grid(row=r, column=0, columnspan=3, sticky="we", pady=(10, 0))
        ttk.Label(bar, text=f"設定檔:{cfgmod.CONFIG_PATH}", foreground="#888").pack(side="left")
        ttk.Button(bar, text="取消", command=self._close).pack(side="right", padx=4)
        ttk.Button(bar, text="儲存並套用", command=self._save).pack(side="right", padx=4)
        ttk.Button(bar, text="測試連線", command=self._test).pack(side="right", padx=4)

        for v in (self.v_dir, self.v_py, self.v_host, self.v_port, self.v_extra):
            v.trace_add("write", lambda *_: self._refresh_preview())
        self._refresh_preview()
        win.lift()
        win.focus_force()

    # ── 內部 ────────────────────────────────────────────────────────────
    def _collect(self) -> dict:
        try:
            port = int(self.v_port.get().strip() or "0")
        except ValueError:
            port = -1
        return {
            "comfy_dir": self.v_dir.get().strip(),
            "python_exe": self.v_py.get().strip(),
            "host": self.v_host.get().strip() or "0.0.0.0",
            "port": port,
            "extra_args": self.v_extra.get().strip(),
            "autostart_comfy": self.v_auto.get(),
            "auto_restart": self.v_restart.get(),
            "start_with_windows": self.v_boot.get(),
        }

    def _refresh_preview(self) -> None:
        cfg = self._collect()
        try:
            cmd = " ".join(cfgmod.build_command(cfg))
        except (OSError, ValueError) as e:
            cmd = f"(組不出指令:{e})"
        self.preview.configure(state="normal")
        self.preview.delete("1.0", "end")
        self.preview.insert("1.0", cmd)
        self.preview.configure(state="disabled")

        warn = cfgmod.check(cfg)
        risky = cfgmod.risky(cfg["extra_args"])
        parts = [warn] if warn else []
        parts += [f"⚠ {r}" for r in risky]
        self.msg.configure(text="\n".join(parts))

    def _pick_dir(self) -> None:
        guess = self.v_dir.get() or cfgmod.guess_comfy_dir()
        d = filedialog.askdirectory(parent=self.win, title="選 ComfyUI 資料夾", initialdir=guess or None)
        if d:
            self.v_dir.set(d)

    def _pick_py(self) -> None:
        p = filedialog.askopenfilename(parent=self.win, title="選 python 執行檔")
        if p:
            self.v_py.set(p)

    def _test(self) -> None:
        cfg = self._collect()
        url = f"http://127.0.0.1:{cfg['port']}"
        stats = tray_proc.probe(f"{url}/system_stats", timeout=3)
        if stats is None:
            messagebox.showwarning(
                "測試連線",
                f"{url} 沒有回應。\n\nComfyUI 還沒起來、或連接埠不是這個。",
                parent=self.win,
            )
            return
        sysinfo = stats.get("system") or {}
        devs = stats.get("devices") or []
        dev = devs[0].get("name", "?") if devs else "?"
        messagebox.showinfo(
            "測試連線",
            f"通了:{url}\nComfyUI {sysinfo.get('comfyui_version', '?')}\n裝置:{dev}",
            parent=self.win,
        )

    def _save(self) -> None:
        cfg = self._collect()
        err = cfgmod.check(cfg)
        if err and not messagebox.askyesno(
            "設定看起來不對", f"{err}\n\n還是要存起來嗎?", parent=self.win
        ):
            return
        self.on_save(cfg)
        self._close()

    def _close(self) -> None:
        type(self)._open = None
        try:
            self.win.destroy()
        except tk.TclError:
            pass


class LogWindow:
    _open: "LogWindow | None" = None

    @classmethod
    def show(cls, root: tk.Tk, daemon: tray_proc.ComfyDaemon) -> None:
        if cls._open is not None and cls._open.win.winfo_exists():
            cls._open.win.deiconify()
            cls._open.win.lift()
            return
        cls._open = cls(root, daemon)

    def __init__(self, root: tk.Tk, daemon: tray_proc.ComfyDaemon):
        self.daemon = daemon
        self.win = win = tk.Toplevel(root)
        win.title("ComfyUI 記錄")
        win.geometry("860x480")
        win.protocol("WM_DELETE_WINDOW", self._close)

        self.text = tk.Text(win, wrap="none", background="#111", foreground="#ddd",
                            insertbackground="#ddd")
        sb = ttk.Scrollbar(win, orient="vertical", command=self.text.yview)
        self.text.configure(yscrollcommand=sb.set)
        self.text.pack(side="top", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        bar = ttk.Frame(win)
        bar.pack(side="bottom", fill="x")
        self.follow = tk.BooleanVar(value=True)
        ttk.Checkbutton(bar, text="自動捲到最後", variable=self.follow).pack(side="left", padx=6)
        ttk.Button(bar, text="開啟記錄檔位置",
                   command=lambda: _open_in_explorer(cfgmod.log_dir(daemon.cfg))).pack(
                       side="right", padx=6)
        self._tick()

    def _tick(self) -> None:
        if not self.win.winfo_exists():
            return
        body = self.daemon.tail(400)
        if body != self.text.get("1.0", "end-1c"):
            self.text.delete("1.0", "end")
            self.text.insert("1.0", body)
            if self.follow.get():
                self.text.see("end")
        self.win.after(1500, self._tick)

    def _close(self) -> None:
        type(self)._open = None
        try:
            self.win.destroy()
        except tk.TclError:
            pass
