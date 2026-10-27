param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$Notes = "",
    [switch]$Confirmed
)

$ErrorActionPreference = 'Continue'

function Fail([string]$Message) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Info([string]$Message) {
    Write-Host $Message
}

if (-not (Test-Path -LiteralPath $ZipPath)) {
    Fail "ZIP file not found: $ZipPath"
}

$tag = 'v' + $Version
$zipName = Split-Path -Leaf $ZipPath
$sha256 = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLower()

Push-Location -LiteralPath $Root
try {
    # Detect GitHub repository from the existing origin remote.
    $remoteUrl = (git remote get-url origin 2>$null)
    if (-not $remoteUrl) {
        Fail "No 'origin' remote is configured. Add one pointing to your GitHub repository, e.g. git remote add origin https://github.com/OWNER/REPO.git"
    }
    $remoteUrl = $remoteUrl.Trim()
    $repo = $null
    if ($remoteUrl -match 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/]+?)(\.git)?$') {
        $repo = $Matches['owner'] + '/' + $Matches['repo']
    }
    if (-not $repo) {
        Fail "Could not detect a GitHub repository from origin URL: $remoteUrl"
    }
    Info "Detected GitHub repository: $repo"

    # GitHub CLI availability and authentication.
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "GitHub CLI (gh) is not installed or not on PATH." -ForegroundColor Yellow
        Write-Host "Install it from https://cli.github.com/ and ensure 'gh' is available in PATH."
        Write-Host "Then authenticate with: gh auth login"
        Write-Host "No release was published."
        exit 1
    }
    $authOut = & gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "GitHub CLI is not authenticated." -ForegroundColor Yellow
        Write-Host ($authOut | Out-String).Trim()
        Write-Host "Authenticate with: gh auth login"
        Write-Host "No release was published."
        exit 1
    }

    # Non-destructive recheck using the existing updater validation logic.
    $env:ZIP = $ZipPath
    $env:NODE_PATH = (Join-Path $Root 'node_modules')
    $checkCode = @'
const fs = require('fs');
const bm = require(process.env.BM_PATH);
(async () => {
  const buf = fs.readFileSync(process.env.ZIP);
  const v = await bm.validateUpdatePackageBuffer(buf);
  if (v.protectedCount > 0) {
    console.error('Protected/runtime entries found: ' + JSON.stringify(v.protectedEntries));
    process.exit(1);
  }
  console.log('RECHECK_OK files=' + v.fileCount + ' protected=' + v.protectedCount);
})().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
'@
    $env:BM_PATH = Join-Path $Root 'server/backup-manager.js'
    $checkOut = & node --no-warnings -e $checkCode 2>&1
    $checkExit = $LASTEXITCODE
    if ($checkExit -ne 0) {
        Write-Host ($checkOut | Out-String)
        Fail "ZIP recheck failed; refusing to publish."
    }
    Info ($checkOut | Out-String).Trim()

    # Refuse to overwrite an existing tag or release (local first, then origin).
    $localTag = (& git rev-parse -q --verify "refs/tags/$tag" 2>$null)
    if ($localTag) {
        Fail "Tag $tag already exists locally. Refusing to overwrite."
    }
    $existingTag = (& git ls-remote --tags origin "refs/tags/$tag" 2>$null)
    if ($existingTag) {
        Fail "Tag $tag already exists on origin. Refusing to overwrite."
    }
    & gh release view $tag --repo $repo 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Fail "Release $tag already exists. Refusing to overwrite."
    }

    # Generate concise release notes from verified changes if not supplied.
    if ([string]::IsNullOrWhiteSpace($Notes)) {
        $prevTag = (& git describe --tags --abbrev=0 2>$null)
        if ($prevTag) {
            $commits = & git log "$prevTag..HEAD" --pretty=format:'- %s' 2>$null
        } else {
            $commits = & git log -n 20 --pretty=format:'- %s' 2>$null
        }
        if ($commits) {
            $Notes = ($commits -join "`n").Trim()
        }
    }
    if ([string]::IsNullOrWhiteSpace($Notes)) {
        if ([Console]::IsInputRedirected) {
            $Notes = "Release $tag"
            Info "No reliable commit history found; using default release notes."
        } else {
            Write-Host "No reliable release notes could be generated."
            $lines = @()
            while ($true) {
                $line = Read-Host "Release note line (empty to finish)"
                if ([string]::IsNullOrWhiteSpace($line)) { break }
                $lines += $line
            }
            $Notes = ($lines -join "`n").Trim()
            if ([string]::IsNullOrWhiteSpace($Notes)) {
                $Notes = "Release $tag"
            }
        }
    }

    $notesFile = Join-Path $env:TEMP ("camzy-release-notes-" + $Version + ".md")
    Set-Content -LiteralPath $notesFile -Value $Notes -Encoding UTF8

    $shaFile = $ZipPath + '.sha256'
    $assets = @($ZipPath)
    if (Test-Path -LiteralPath $shaFile) {
        $assets += $shaFile
    }

    Info "Creating GitHub release $tag in $repo ..."
    $ghArgs = @('release', 'create', $tag) + $assets + @('--repo', $repo, '--title', $tag, '--notes-file', $notesFile)
    & gh @ghArgs
    if ($LASTEXITCODE -ne 0) {
        Fail "gh release create failed."
    }

    # Verify the uploaded asset is present.
    $assetNames = & gh release view $tag --repo $repo --json assets -q '.assets[].name' 2>$null
    if (-not ($assetNames -contains $zipName)) {
        Fail "Upload verification failed: $zipName not found in release $tag."
    }

    $releaseUrl = & gh release view $tag --repo $repo --json url -q .url 2>$null
    if (-not $releaseUrl) {
        $releaseUrl = "https://github.com/$repo/releases/tag/$tag"
    }

    Write-Host ""
    Write-Host "PUBLISH SUCCESSFUL" -ForegroundColor Green
    Write-Host "Release URL : $releaseUrl"
    Write-Host "Asset name  : $zipName"
    Write-Host "Version     : $Version"
    Write-Host "SHA-256     : $sha256"
} finally {
    Pop-Location
}
