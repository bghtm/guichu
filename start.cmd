@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   ▸ 冰棍鬼畜作品集 · 本地预览
echo   ▸ http://127.0.0.1:4477/
echo.
start "" "http://127.0.0.1:4477/"
node server.mjs --port 4477
