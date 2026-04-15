@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "REMOTE_URL=ssh://git@ssh.github.com:443/XMaoCAT/XMaoClock_Server.git"

where git >nul 2>nul
if errorlevel 1 (
  echo [Upload] 未找到 git，请先安装 Git for Windows。
  exit /b 1
)

if not exist ".git" (
  echo [Upload] 当前目录还不是 git 仓库，正在初始化...
  git init
  if errorlevel 1 (
    echo [Upload] git init 失败。
    exit /b 1
  )
)

git branch -M main >nul 2>nul

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin "%REMOTE_URL%"
) else (
  git remote set-url origin "%REMOTE_URL%"
)

set "COMMIT_MSG=%~1"
if "%COMMIT_MSG%"=="" (
  set "COMMIT_MSG=Update XMaoClock server"
)

git add -A
if errorlevel 1 (
  echo [Upload] git add 失败。
  exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
  echo [Upload] 当前没有新的改动，直接检查远程同步。
  goto push_now
)

echo [Upload] 正在提交改动...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
  echo [Upload] git commit 失败。
  exit /b 1
)

:push_now
echo [Upload] 正在通过 SSH 推送到 GitHub...
git push -u origin main
if errorlevel 1 (
  echo [Upload] 推送失败，请检查 SSH Key、网络或仓库权限。
  exit /b 1
)

echo [Upload] 推送完成。
exit /b 0
