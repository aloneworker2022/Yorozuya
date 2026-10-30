' ============================================================
'  Yorozuya ComfyUI tray - silent launcher
'
'  Double-click this. Nothing appears except the tray icon in
'  the notification area (bottom right). No console flash:
'  WScript.Shell.Run with window style 0 never creates one.
'
'  Put a shortcut to this file in shell:startup, or just turn on
'  "start with Windows" in the tray settings window.
'
'  ASCII only on purpose: .vbs is read in the system codepage
'  (cp950 here), UTF-8 Chinese would be garbled.
' ============================================================

Option Explicit

Dim fso, sh, here, py, script, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(here, "comfy_tray.pyw")

If Not fso.FileExists(script) Then
    MsgBox "comfy_tray.pyw is missing next to this launcher:" & vbCrLf & script, _
           vbCritical, "Yorozuya ComfyUI"
    WScript.Quit 1
End If

' Prefer the portable interpreter: it is the one with torch installed.
py = fso.BuildPath(here, "python_embeded\pythonw.exe")
If Not fso.FileExists(py) Then py = fso.BuildPath(here, "..\python_embeded\pythonw.exe")
If Not fso.FileExists(py) Then py = "pythonw.exe"

cmd = """" & py & """ """ & script & """"
sh.Run cmd, 0, False
