Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
shell.Run "powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File """ & root & "\tools\tray.ps1""", 0, False
