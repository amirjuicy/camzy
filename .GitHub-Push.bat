```bat
@echo off
chcp 65001 >nul
setlocal
title Camzy - GitHub Push

cd /d "%~dp0"

echo ========================================
echo           CAMZY - GITHUB PUSH
echo ========================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed or not in PATH.
    pause
    exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo ERROR: Place this file in the project Git folder.
    pause
    exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo ERROR: GitHub remote "origin" is not configured.
    pause
    exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"

if not defined BRANCH (
    echo ERROR: Could not detect the current branch.
    pause
    exit /b 1
)

echo Current branch: %BRANCH%
echo.
echo Adding project changes...
git add -A

if errorlevel 1 (
    echo ERROR: git add failed.
    pause
    exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 goto PUSH

set "MSG=Update Camzy"
set /p "MSG=Commit message (Enter for default): "
if not defined MSG set "MSG=Update Camzy"

git commit -m "%MSG%"
if errorlevel 1 (
    echo ERROR: Commit failed.
    pause
    exit /b 1
)

:PUSH
echo.
echo Pushing to GitHub...
git push -u origin "%BRANCH%"

if errorlevel 1 (
    echo.
    echo ERROR: Push failed. Check the error above.
    pause
    exit /b 1
)

echo.
echo SUCCESS: Push completed.
pause
endlocal
```