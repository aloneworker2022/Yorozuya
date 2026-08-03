@echo off
rem ============================================================
rem  Install what the tray program needs (pystray + Pillow) into
rem  the SAME interpreter that will run it - the portable one.
rem
rem  This window is supposed to be visible: you want to see pip
rem  fail if it fails. The tray program itself never opens one.
rem
rem  ASCII only on purpose (cmd reads .bat in the system codepage).
rem ============================================================

setlocal EnableExtensions
title Yorozuya ComfyUI tray - install deps

set "HERE=%~dp0"
set "PY=%HERE%python_embeded\python.exe"
if not exist "%PY%" set "PY=%HERE%..\python_embeded\python.exe"
if not exist "%PY%" set "PY=python"

echo Using interpreter: %PY%
echo.
"%PY%" -m pip install -r "%HERE%requirements.txt"
set "RC=%errorlevel%"

echo.
if "%RC%"=="0" (
    echo Done. Now double-click start_comfy_tray.vbs
) else (
    echo pip failed with code %RC%.
    echo If pip itself is missing from the portable python, run:
    echo     "%PY%" -m ensurepip
)
pause
