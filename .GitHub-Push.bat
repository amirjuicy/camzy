@echo off
rem NOTE: do not switch the code page here. With "chcp 65001" cmd.exe can no
rem longer read a redirected stdin, so "set /p" silently discards the typed
rem commit message. This script is pure ASCII, so no code page change is
rem needed for correct display.
setlocal EnableExtensions
title Camzy - GitHub Push

rem ===================================================================
rem  CAMZY - GITHUB PUSH
rem
rem  Publishes the Camzy project and nothing else.
rem  Target repository : https://github.com/amirjuicy/camzy.git
rem
rem  Safety rules enforced below:
rem    - the repository root must be the folder that holds this script
rem    - remote "origin" (fetch AND push) must be exactly the Camzy repo
rem    - "origin" must be the only remote, so Abzar Shokri is unreachable
rem    - the branch must be main
rem    - any failing git command aborts before anything is published
rem ===================================================================

set "EXPECTED_REMOTE=https://github.com/amirjuicy/camzy.git"
set "TARGET_BRANCH=main"
set "DEFAULT_MSG=Update Camzy"

echo ========================================
echo           CAMZY - GITHUB PUSH
echo ========================================
echo Target repository: %EXPECTED_REMOTE%
echo.

rem --- 1. Git must be available ---------------------------------------
where git >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed or not in PATH.
    goto :fail
)

rem --- 2. Work in the folder that contains this script -----------------
cd /d "%~dp0"
if errorlevel 1 (
    echo ERROR: Cannot open the project folder "%~dp0".
    goto :fail
)

rem --- 3. Repository root must match this script's folder --------------
set "REPO_ROOT="
for /f "delims=" %%R in ('git rev-parse --show-toplevel 2^>nul') do set "REPO_ROOT=%%R"
if not defined REPO_ROOT (
    echo ERROR: This folder is not inside a Git working tree.
    echo        Put this file in the root of the Camzy repository.
    goto :fail
)

set "SCRIPT_DIR=%~dp0."
for %%I in ("%SCRIPT_DIR%") do set "SCRIPT_DIR=%%~fI"
for %%I in ("%REPO_ROOT%") do set "REPO_ROOT=%%~fI"

if /i not "%SCRIPT_DIR%"=="%REPO_ROOT%" (
    echo ERROR: Repository root mismatch.
    echo        Script folder : %SCRIPT_DIR%
    echo        Git root      : %REPO_ROOT%
    echo        This script must stay in the root of the Camzy repository.
    goto :fail
)

rem --- 4. Remote "origin" must be exactly the Camzy repository ---------
set "FETCH_URL="
set "PUSH_URL="
for /f "delims=" %%U in ('git remote get-url origin 2^>nul') do set "FETCH_URL=%%U"
for /f "delims=" %%U in ('git remote get-url --push origin 2^>nul') do set "PUSH_URL=%%U"

if not defined FETCH_URL (
    echo ERROR: GitHub remote "origin" is not configured.
    goto :fail
)
if not defined PUSH_URL (
    echo ERROR: Could not resolve the push URL of remote "origin".
    goto :fail
)
if /i not "%FETCH_URL%"=="%EXPECTED_REMOTE%" (
    echo ERROR: Remote "origin" is not the Camzy repository.
    echo        Expected : %EXPECTED_REMOTE%
    echo        Found    : %FETCH_URL%
    echo        Aborting - nothing was staged, committed or published.
    goto :fail
)
if /i not "%PUSH_URL%"=="%EXPECTED_REMOTE%" (
    echo ERROR: The push URL is not the Camzy repository.
    echo        Expected : %EXPECTED_REMOTE%
    echo        Found    : %PUSH_URL%
    echo        Aborting - nothing was staged, committed or published.
    goto :fail
)

rem --- 5. "origin" must be the only remote (never reach Abzar Shokri) ---
set "REMOTE_COUNT=0"
set "REMOTE_NAME="
for /f "tokens=1" %%A in ('git remote 2^>nul') do (
    set /a REMOTE_COUNT+=1
    set "REMOTE_NAME=%%A"
)
if not "%REMOTE_COUNT%"=="1" (
    echo ERROR: Expected exactly one remote, found %REMOTE_COUNT%.
    echo        This script publishes the Camzy repository only.
    goto :fail
)
if /i not "%REMOTE_NAME%"=="origin" (
    echo ERROR: The only remote is named "%REMOTE_NAME%", expected "origin".
    goto :fail
)

rem --- 6. Branch must be main ------------------------------------------
set "BRANCH="
for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "BRANCH=%%B"
if not defined BRANCH (
    echo ERROR: Could not detect the current branch - detached HEAD.
    goto :fail
)
if /i not "%BRANCH%"=="%TARGET_BRANCH%" (
    echo ERROR: Current branch is "%BRANCH%", expected "%TARGET_BRANCH%".
    echo        Switch to %TARGET_BRANCH% and run this script again.
    goto :fail
)

echo Repository root : %REPO_ROOT%
echo Branch          : %BRANCH%
echo Remote          : %EXPECTED_REMOTE%
echo.

rem --- 7. Stage the Camzy changes --------------------------------------
echo Adding project changes...
git add -A
if errorlevel 1 (
    echo ERROR: "git add -A" failed.
    goto :fail
)

git diff --cached --quiet
if not errorlevel 1 goto PUSH

rem --- 8. Commit using the Camzy default message -----------------------
set "MSG=%DEFAULT_MSG%"
set /p "MSG=Commit message (Enter for default: %DEFAULT_MSG%): "
if not defined MSG set "MSG=%DEFAULT_MSG%"
if "%MSG%"=="" set "MSG=%DEFAULT_MSG%"

echo.
echo Committing: %MSG%
git commit -m "%MSG%"
if errorlevel 1 (
    echo ERROR: "git commit" failed.
    goto :fail
)

rem --- 9. Push to the Camzy repository ---------------------------------
:PUSH
echo.
echo Pushing to GitHub - %EXPECTED_REMOTE%...
git push -u origin %TARGET_BRANCH%
if errorlevel 1 (
    echo.
    echo ERROR: Push failed. Check the error above.
    goto :fail
)

echo.
echo SUCCESS: Push completed.
pause
endlocal
exit /b 0

rem --- Abort handler ---------------------------------------------------
:fail
echo.
echo ABORTED - nothing was published.
pause
endlocal
exit /b 1
