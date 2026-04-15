@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "REMOTE_URL=ssh://git@ssh.github.com:443/XMaoCAT/XMaoClock_Server.git"

where git >nul 2>nul
if errorlevel 1 (
  echo [Upload] Git for Windows was not found.
  exit /b 1
)

if not exist ".git" (
  echo [Upload] Initializing git repository...
  git init
  if errorlevel 1 (
    echo [Upload] git init failed.
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
  echo [Upload] git add failed.
  exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
  echo [Upload] No new changes to commit. Checking remote sync only.
  goto push_now
)

echo [Upload] Creating commit...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
  echo [Upload] git commit failed.
  exit /b 1
)

:push_now
echo [Upload] Pushing to GitHub over SSH...
git push -u origin main
if errorlevel 1 (
  echo [Upload] Push failed. Check SSH keys, network, or repository access.
  exit /b 1
)

echo [Upload] Push completed.
exit /b 0
