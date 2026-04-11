@echo off
cd /d %~dp0\..\..
start "XMaoClock Node" cmd /c node server.js
cd /d %~dp0
caddy run --config Caddyfile
