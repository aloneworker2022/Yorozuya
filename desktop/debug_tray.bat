@echo off
rem ============================================================
rem  Same program, but run through python.exe so the console
rem  stays and you can read the traceback.
rem
rem  Use this ONLY when start_comfy_tray.vbs does nothing at all
rem  (no icon appears). Normal daily use: the .vbs.
rem
rem  ASCII only on purpose (cmd reads .bat in the system codepage).
rem ============================================================

setlocal EnableExtensions
title Yorozuya ComfyUI tray - debug

set "HERE=%~dp0"
set "PY=%HERE%python_embeded\python.exe"
if not exist "%PY%" set "PY=%HERE%..\python_embeded\python.exe"
if not exist "%PY%" set "PY=python"

echo Using interpreter: %PY%
echo.
"%PY%" "%HERE%comfy_tray.pyw"
echo.
echo Exited with code %errorlevel%.
pause
