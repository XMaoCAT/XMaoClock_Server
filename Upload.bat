@echo off
setlocal EnableExtensions

set "UPLOAD_EXIT_CODE=0"
set "UPLOAD_PAUSE=1"
if /I "%UPLOAD_NO_PAUSE%"=="1" set "UPLOAD_PAUSE=0"

cd /d "%~dp0"

set "REMOTE_URL=ssh://git@ssh.github.com:443/XMaoCAT/XMaoClock_Server.git"

where git >nul 2>nul
if errorlevel 1 (
  echo [Upload] Git for Windows was not found.
  set "UPLOAD_EXIT_CODE=1"
  goto finish
)

if not exist ".git" (
  echo [Upload] Initializing git repository...
  git init
  if errorlevel 1 (
    echo [Upload] git init failed.
    set "UPLOAD_EXIT_CODE=1"
    goto finish
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
  set "UPLOAD_EXIT_CODE=1"
  goto finish
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
  set "UPLOAD_EXIT_CODE=1"
  goto finish
)

:push_now
echo [Upload] Pushing to GitHub over SSH...
git push -u origin main
if errorlevel 1 (
  echo [Upload] Push failed. Check SSH keys, network, or repository access.
  set "UPLOAD_EXIT_CODE=1"
  goto finish
)

echo [Upload] Push completed.

:finish
if "%UPLOAD_PAUSE%"=="1" (
  echo.
  if "%UPLOAD_EXIT_CODE%"=="0" (
    echo [Upload] Done. Press any key to close this window...
  ) else (
    echo [Upload] Finished with errors. Press any key to close this window...
  )
  pause >nul
)
exit /b %UPLOAD_EXIT_CODE%
