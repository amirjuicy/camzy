@echo off
rem NOTE: keep this script pure ASCII. Do not change the code page: with
rem "chcp 65001" cmd.exe can no longer read redirected stdin, so "set /p"
rem silently discards typed input.
setlocal EnableExtensions
title Camzy - Build Release

rem ===================================================================
rem  CAMZY - BUILD RELEASE
rem
rem  Builds a production-ready GitHub Release package (ZIP) using the
rem  existing updater's package format and validation logic.
rem  Nothing is published, pushed, committed or installed by this script.
rem ===================================================================

rem --- 1. Resolve project root (folder holding this script) -------------
cd /d "%~dp0"
if errorlevel 1 (
    echo ERROR: Cannot open the project folder "%~dp0".
    goto :fail
)
set "ROOT=%CD%"

rem --- 2. Required tools ------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH.
    goto :fail
)
where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: powershell.exe is not available.
    goto :fail
)

rem --- 3. Detect current application version ---------------------------
set "P=%ROOT%\package.json"
set "CURRENT_VERSION="
for /f "delims=" %%V in ('node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync(process.env.P,'utf8')).version);"') do set "CURRENT_VERSION=%%V"
if not defined CURRENT_VERSION set "CURRENT_VERSION=1.0.0"

rem --- 4. Compute default next patch version ---------------------------
set "V=%CURRENT_VERSION%"
set "DEFAULT_VERSION="
for /f "delims=" %%D in ('node -e "const v=process.env.V; const m=v.match(/^(\d+)\.(\d+)\.(\d+)/); const a=m?m[1]:\"1\"; const b=m?m[2]:\"0\"; const c=m?m[3]:\"0\"; console.log(a+\".\"+b+\".\"+(+c+1));"') do set "DEFAULT_VERSION=%%D"
if not defined DEFAULT_VERSION set "DEFAULT_VERSION=1.0.1"

echo ========================================
echo        CAMZY - BUILD RELEASE
echo ========================================
echo Project root    : %ROOT%
echo Current version : %CURRENT_VERSION%
echo Default version : %DEFAULT_VERSION%
echo.

rem --- 5. Ask for the new version --------------------------------------
set "NEW_VERSION="
set /p "NEW_VERSION=New version (Enter for default %DEFAULT_VERSION%): "
if not defined NEW_VERSION set "NEW_VERSION=%DEFAULT_VERSION%"
if "%NEW_VERSION%"=="" set "NEW_VERSION=%DEFAULT_VERSION%"

rem --- 6. Validate version format ---------------------------------------
node -e "if(!/^\d+\.\d+\.\d+$/.test(process.argv[1])){console.error('Invalid version format: '+process.argv[1]);process.exit(1)}" "%NEW_VERSION%"
if errorlevel 1 (
    echo ERROR: Version must be numeric semver, e.g. 1.0.1
    goto :fail
)

set "ZIP_NAME=camzy-update-%NEW_VERSION%.zip"
set "OUT_DIR=%ROOT%\release-output"
set "ZIP_PATH=%OUT_DIR%\%ZIP_NAME%"

rem --- 7. Prevent overwriting an existing release ZIP -------------------
if exist "%ZIP_PATH%" (
    echo ERROR: Release ZIP already exists, refusing to overwrite:
    echo        %ZIP_PATH%
    echo Delete it manually if you really want to rebuild this version.
    goto :fail
)

rem --- 8. Bump package.json version (with backup for safe rollback) -----
set "PKG_BACKUP=%TEMP%\camzy-package.json.bak"
copy /Y "%ROOT%\package.json" "%PKG_BACKUP%" >nul
node -e "const fs=require('fs');const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,'utf8'));j.version=process.argv[2];fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n');" "%ROOT%\package.json" "%NEW_VERSION%"
if errorlevel 1 (
    echo ERROR: Failed to update package.json version.
    copy /Y "%PKG_BACKUP%" "%ROOT%\package.json" >nul
    goto :fail
)

rem --- 9. Build the package using the existing script -------------------
pushd "%ROOT%"
node "scripts\build-release.js" "%NEW_VERSION%"
set "BUILD_RC=%ERRORLEVEL%"
popd
if not "%BUILD_RC%"=="0" (
    echo ERROR: Build failed ^(exit code %BUILD_RC%^). Restoring package.json.
    copy /Y "%PKG_BACKUP%" "%ROOT%\package.json" >nul
    goto :fail
)

rem --- 10. Compute size and SHA-256 ------------------------------------
set "ZIP_SIZE="
for /f "delims=" %%S in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "(Get-Item -LiteralPath '%ZIP_PATH%').Length"') do set "ZIP_SIZE=%%S"
set "ZIP_HASH="
for /f "delims=" %%H in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "(Get-FileHash -LiteralPath '%ZIP_PATH%' -Algorithm SHA256).Hash"') do set "ZIP_HASH=%%H"

if not exist "%ZIP_PATH%" (
    echo ERROR: Expected ZIP was not created: %ZIP_PATH%
    goto :fail
)

echo.
echo ========================================
echo BUILD SUCCESSFUL
echo ========================================
echo ZIP path : %ZIP_PATH%
echo Version  : %NEW_VERSION%
echo Size     : %ZIP_SIZE% bytes
echo SHA-256  : %ZIP_HASH%
echo.

rem --- 11. Non-destructive recheck before publishing --------------------
set "BM_PATH=%ROOT%\server\backup-manager.js"
set "ZIP=%ZIP_PATH%"
set "ZIPCHECK_RC=0"
node --no-warnings -e "const fs=require('fs');const bm=require(process.env.BM_PATH);(async()=>{const buf=fs.readFileSync(process.env.ZIP);const v=await bm.validateUpdatePackageBuffer(buf);if(v.protectedCount>0){console.error('Protected/runtime entries found: '+JSON.stringify(v.protectedEntries));process.exit(1);}console.log('RECHECK_OK files='+v.fileCount+' protected='+v.protectedCount);})().catch(e=>{console.error(e&&e.message?e.message:e);process.exit(1);});"
set "ZIPCHECK_RC=%ERRORLEVEL%"
if not "%ZIPCHECK_RC%"=="0" (
    echo ERROR: ZIP recheck failed; refusing to publish.
    goto :fail
)

rem --- 12. Optional GitHub publication ---------------------------------
set "REMOTE_URL="
for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "REMOTE_URL=%%R"
if defined REMOTE_URL echo Detected Git remote: %REMOTE_URL%

set "PUBLISH="
set /p "PUBLISH=Publish this release to GitHub now? (y/N): "
if /i not "%PUBLISH%"=="y" (
    echo.
    echo Release was built and validated but NOT published.
    echo Upload manually if desired:
    echo   %ZIP_PATH%
    echo   %OUT_DIR%\%ZIP_NAME%.sha256
    echo.
    pause
    endlocal
    exit /b 0
)

where gh >nul 2>&1
if errorlevel 1 (
    echo.
    echo GitHub CLI ^(gh^) is not installed or not on PATH.
    echo Install it from https://cli.github.com/ and ensure "gh" is available.
    echo Then authenticate with: gh auth login
    echo The built ZIP remains at: %ZIP_PATH%
    echo.
    pause
    endlocal
    exit /b 0
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Publish-GitHubRelease.ps1" -Version "%NEW_VERSION%" -ZipPath "%ZIP_PATH%" -Root "%ROOT%" -Confirmed
set "PUBLISH_RC=%ERRORLEVEL%"
if not "%PUBLISH_RC%"=="0" (
    echo.
    echo ERROR: GitHub publication failed ^(exit code %PUBLISH_RC%^).
    echo The built ZIP remains at: %ZIP_PATH%
    pause
    endlocal
    exit /b 1
)

echo.
pause
endlocal
exit /b 0

rem --- Abort handler ---------------------------------------------------
:fail
echo.
echo BUILD FAILED - no release package was produced.
pause
endlocal
exit /b 1