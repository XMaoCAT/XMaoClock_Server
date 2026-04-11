$ErrorActionPreference = 'Stop'

Write-Host '[XMaoClock] 开始无痛更新 Windows 部署...'
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-windows.ps1 | iex"
