"""常駐程式的設定檔、路徑推測、開機自動啟動。

取代原本的 `start_comfy.bat`。那支 bat 的三件事這裡都有:放進
ComfyUI_windows_portable 就免設定(`%~dp0` → `script_dir()`)、記錄輪替、
當掉自動重開。**唯一拿掉的是那個 cmd 視窗。**

設定放使用者目錄(`%APPDATA%\\Yorozuya\\comfy-tray.json`),記錄則沿用 bat 的
位置(攜帶版資料夾底下的 `yorozuya-logs\\`)——舊記錄跟新記錄留在同一個地方,
出事時翻的還是同一個資料夾。

推測路徑的原則:**猜錯要看得出來,不要偷偷用錯的**。所有推測結果都會顯示在
設定視窗的「實際會執行」那一行,使用者按儲存前就能看到猜到哪去了。
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

APP_NAME = "YorozuyaComfyTray"
IS_WINDOWS = os.name == "nt"

# ComfyUI 常駐的必要參數:對外聽(手機/RP5 才連得到)、不要自己開瀏覽器。
# --disable-auto-launch 就是「開了不要有畫面卡在螢幕上」的那一半,
# 另一半(黑窗)由 tray_proc 的 CREATE_NO_WINDOW 處理。
FORCED_ARGS = ["--disable-auto-launch"]

# 這兩個會把模型釘死在 VRAM,RP5 的 /free 卸不乾淨 → GPU 換班失效,
# 聊天那邊就會 OOM。使用者要加也擋不住(他說了算),但要當面講。
RISKY_ARGS = {
    "--highvram": "會把模型釘在 VRAM,RP5 的 /free 卸不乾淨,聊天那邊會 OOM",
    "--gpu-only": "同上,GPU 換班會失效",
    "--auto-launch": "會自己彈瀏覽器出來,正是這支程式要消滅的東西",
}

DEFAULTS: dict = {
    # 攜帶版根目錄(裡面有 python_embeded\ 與 ComfyUI\),或直接是含 main.py 的
    # ComfyUI 目錄——兩種都認。留空 = 自動找,先找這支程式自己所在的資料夾。
    "comfy_dir": "",
    "python_exe": "",         # 留空 = 自動找(內嵌 python → venv → 系統 python)
    "host": "0.0.0.0",        # 0.0.0.0 才連得到;127.0.0.1 = 只有這台自己看得到
    "port": 8188,
    "extra_args": "",         # 例:--lowvram --preview-method auto
    "autostart_comfy": True,  # 常駐程式一開就把 ComfyUI 拉起來
    "auto_restart": True,     # ComfyUI 自己當掉時重開
    "start_with_windows": False,
}


def config_dir() -> Path:
    if IS_WINDOWS:
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / "Yorozuya"
    base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base) / "yorozuya"


CONFIG_PATH = config_dir() / "comfy-tray.json"


def script_dir() -> Path:
    """這支程式自己所在的資料夾 = bat 裡的 %~dp0。

    放進 ComfyUI_windows_portable 就免設定,靠的就是這個。
    """
    return Path(__file__).resolve().parent


def log_dir(cfg: dict) -> Path:
    """記錄放哪:沿用 bat 的 `<攜帶版>\\yorozuya-logs\\`,不知道就退回設定目錄。"""
    d = (cfg.get("comfy_dir") or "").strip()
    if d:
        try:
            p = Path(d)
            if p.is_dir():
                return p / "yorozuya-logs"
        except OSError:
            pass
    return config_dir()


def log_path(cfg: dict) -> Path:
    return log_dir(cfg) / "comfyui.log"


def load() -> dict:
    cfg = dict(DEFAULTS)
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            for k in DEFAULTS:
                if k in raw:
                    cfg[k] = raw[k]
    except FileNotFoundError:
        pass
    except (OSError, ValueError):
        # 設定檔壞了不該讓常駐程式起不來——用預設值繼續,存檔時會蓋掉。
        pass
    try:
        cfg["port"] = int(cfg["port"])
    except (TypeError, ValueError):
        cfg["port"] = DEFAULTS["port"]
    return cfg


def save(cfg: dict) -> None:
    config_dir().mkdir(parents=True, exist_ok=True)
    data = {k: cfg.get(k, DEFAULTS[k]) for k in DEFAULTS}
    tmp = CONFIG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CONFIG_PATH)


# ── 路徑推測 ────────────────────────────────────────────────────────────────

def _isfile(p: Path) -> bool:
    try:
        return p.is_file()
    except OSError:
        return False


def find_main_py(comfy_dir: str) -> Path | None:
    """`main.py` 在哪。攜帶版是 `<根>\\ComfyUI\\main.py`,自己 clone 的是 `<根>\\main.py`。

    兩種都認,使用者才不必去想「該指哪一層」——指錯一層是這類設定最常見的坑。
    """
    if not comfy_dir:
        return None
    d = Path(comfy_dir)
    for cand in (d / "main.py", d / "ComfyUI" / "main.py"):
        if _isfile(cand):
            return cand
    return None


def _candidate_dirs() -> list[Path]:
    home = Path.home()
    names = ["ComfyUI_windows_portable", "ComfyUI", "comfyui"]
    roots = [home, home / "Desktop", home / "Documents", home / "Downloads"]
    if IS_WINDOWS:
        roots += [Path(f"{d}:/") for d in "CDEF"]
    else:
        roots += [Path("/opt"), Path("/srv")]
    return [r / n for r in roots for n in names]


def guess_comfy_dir(current: str = "") -> str:
    """找得到 main.py 才算數。找不到就回空字串,讓使用者自己填。

    第一順位是**這支程式自己所在的資料夾**:跟 bat 一樣,丟進攜帶版就免設定。
    """
    if current and find_main_py(current):
        return current
    here = script_dir()
    for p in [here, here.parent] + _candidate_dirs():
        if find_main_py(str(p)):
            return str(p)
    return ""


def resolve_python(comfy_dir: str, override: str = "") -> str:
    """ComfyUI 要用哪個 python 跑。

    順序有意義:攜帶版的 `python_embeded` 裡才有裝好的 torch,拿系統 python
    去跑攜帶版的 ComfyUI 只會噴 ModuleNotFoundError。
    """
    if override.strip():
        return override.strip()
    exe = "python.exe" if IS_WINDOWS else "python"
    bindir = "Scripts" if IS_WINDOWS else "bin"
    cands: list[Path] = []
    if comfy_dir:
        d = Path(comfy_dir)
        cands += [
            d / "python_embeded" / exe,          # 指到攜帶版根目錄
            d.parent / "python_embeded" / exe,   # 指到裡面那層 ComfyUI\
            d / "venv" / bindir / exe,
            d / ".venv" / bindir / exe,
        ]
    for c in cands:
        if _isfile(c):
            return str(c)
    for name in ("python", "python3"):
        found = shutil.which(name)
        if found:
            return found
    return sys.executable


def is_embedded(python_exe: str) -> bool:
    return Path(python_exe).parent.name.lower() == "python_embeded"


def pythonw_exe() -> str:
    """跑常駐程式自己用的直譯器。pythonw 不會開黑窗,沒有就退回 python。"""
    exe = Path(sys.executable)
    if IS_WINDOWS:
        w = exe.with_name("pythonw.exe")
        if w.is_file():
            return str(w)
    return str(exe)


def risky(extra_args: str) -> list[str]:
    """回傳 extra_args 裡踩到的地雷說明(空 list = 沒事)。"""
    toks = set(extra_args.split())
    return [f"{a}:{why}" for a, why in RISKY_ARGS.items() if a in toks]


def build_command(cfg: dict) -> list[str]:
    comfy_dir = cfg.get("comfy_dir", "") or ""
    py = resolve_python(comfy_dir, cfg.get("python_exe", ""))
    main_py = find_main_py(comfy_dir)
    extra = (cfg.get("extra_args") or "").split()
    cmd = [py]
    # 攜帶版跟 bat 一樣要 -s:內嵌 python 不該去撿使用者的 site-packages,
    # 撿到不相容的 torch 就整個起不來。
    if is_embedded(py):
        cmd.append("-s")
    cmd.append(str(main_py) if main_py else "main.py")
    # 使用者自己在「其他參數」寫了 --listen/--port 就以他的為準:
    # 送兩份進去 ComfyUI 只會吃後面那個,設定頁顯示的卻是前面那個,對不起來。
    if "--listen" not in extra:
        cmd += ["--listen", str(cfg.get("host") or "0.0.0.0")]
    if "--port" not in extra:
        cmd += ["--port", str(cfg.get("port") or 8188)]
    cmd += [a for a in FORCED_ARGS if a not in extra]
    cmd += extra
    return cmd


def check(cfg: dict) -> str:
    """設定能不能用。回空字串 = 可以,否則是給人看的錯誤訊息。"""
    comfy_dir = (cfg.get("comfy_dir") or "").strip()
    if not comfy_dir:
        return "還沒指定 ComfyUI 資料夾"
    if find_main_py(comfy_dir) is None:
        return f"{comfy_dir} 底下找不到 main.py 或 ComfyUI\\main.py,這不是 ComfyUI 的資料夾"
    py = resolve_python(comfy_dir, cfg.get("python_exe", ""))
    if not Path(py).is_file() and not shutil.which(py):
        return f"找不到 python:{py}"
    port = cfg.get("port")
    if not isinstance(port, int) or not (1 <= port <= 65535):
        return f"連接埠不對:{port}"
    return ""


# ── 開機自動啟動(只有 Windows 有)────────────────────────────────────────

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


def autostart_supported() -> bool:
    return IS_WINDOWS


def autostart_enabled() -> bool:
    if not IS_WINDOWS:
        return False
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            winreg.QueryValueEx(key, APP_NAME)
        return True
    except OSError:
        return False


def set_autostart(enabled: bool, script: Path) -> str:
    """回空字串 = 成功,否則是錯誤訊息。寫 HKCU 不需要系統管理員。"""
    if not IS_WINDOWS:
        return "開機自動啟動目前只支援 Windows"
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                cmd = f'"{pythonw_exe()}" "{script}"'
                winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(key, APP_NAME)
                except FileNotFoundError:
                    pass
        return ""
    except OSError as e:
        return f"寫登錄檔失敗:{e}"
