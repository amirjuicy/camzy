<#
Copies the binary / generated parts of the Android scaffolding that cannot be
hand written (gradle wrapper jar + scripts, launcher icons, .metadata) from a
throw-away `flutter create` output.

Existing files are never overwritten, so everything committed in android\ stays
authoritative.
#>
$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDir

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    throw 'Flutter SDK not found on PATH. Install Flutter (https://docs.flutter.dev/get-started/install) and reopen the terminal.'
}

$scaffold = Join-Path ([System.IO.Path]::GetTempPath()) ('camzy_scaffold_' + [Guid]::NewGuid().ToString('N'))

Write-Host 'Generating reference scaffold with `flutter create` ...'
& flutter create --org com.camzy --project-name android_admin_app --platforms android --no-pub $scaffold
if ($LASTEXITCODE -ne 0) {
    throw '`flutter create` failed.'
}

function Copy-MissingFiles {
    param(
        [Parameter(Mandatory = $true)][string] $Source,
        [Parameter(Mandatory = $true)][string] $Destination
    )

    $copied = 0
    Get-ChildItem -LiteralPath $Source -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($Source.Length).TrimStart('\', '/')
        $target = Join-Path $Destination $relative
        if (Test-Path -LiteralPath $target) {
            return
        }
        $parent = Split-Path -Parent $target
        if (-not (Test-Path -LiteralPath $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        Copy-Item -LiteralPath $_.FullName -Destination $target
        $copied++
    }
    return $copied
}

$androidCopied = Copy-MissingFiles -Source (Join-Path $scaffold 'android') -Destination (Join-Path $projectDir 'android')
$metadataCopied = Copy-MissingFiles -Source $scaffold -Destination $projectDir -ErrorAction SilentlyContinue

Remove-Item -LiteralPath $scaffold -Recurse -Force

Write-Host ''
Write-Host "android\ : added $androidCopied generated file(s) (gradle wrapper, launcher icons)."
Write-Host "root     : added $metadataCopied generated file(s) (.metadata)."
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  flutter pub get'
Write-Host '  flutter run'
Write-Host '  flutter build apk --release --dart-define=ADMIN_URL=https://your-host/admin/'
