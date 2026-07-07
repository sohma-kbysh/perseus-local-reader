#requires -Version 5.1
<#
.SYNOPSIS
    Perseus Local Reader - Windows runtime bootstrap.

.DESCRIPTION
    Builds the self-contained Python runtime used by shell.py, without
    requiring the user to install Python themselves. See
    .developer/windows-app/DESIGN.md (S2, S6, S7) for the full design.

    Steps:
      1. Verify this is 64-bit Windows and force TLS 1.2 for downloads.
      2. Download the pinned Python embeddable package (amd64) from
         python.org and extract it under
         .developer/data/vendor/windows-runtime/python/ (resolved relative
         to this script's own location, so the repo can live anywhere,
         including paths containing spaces).
      3. Enable site-packages in python3XX._pth (embeddable Python ships
         with site-packages imports commented out by default).
      4. Bootstrap pip via get-pip.py.
      5. Install .developer/windows-app/requirements.txt (pinned pywebview).
      6. Check for the Microsoft Edge WebView2 Runtime in the registry and
         print bilingual guidance if it is missing (warning only; Windows 11
         ships WebView2 preinstalled, so this never aborts the bootstrap).

    Idempotent: if python.exe already exists and "import webview" already
    succeeds, the script prints a message and exits 0 without doing
    anything else. Every download is written to a temporary file first,
    verified, then renamed/extracted, so an interrupted previous run can
    always be retried safely.

.NOTES
    Invoked by "Perseus Local Reader.bat" as:
      powershell -NoProfile -ExecutionPolicy Bypass -File ".developer\windows-app\bootstrap.ps1"
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # Invoke-WebRequest is much faster without the progress UI.

# ---------------------------------------------------------------------------
# Pinned versions / URLs (see DESIGN.md S6 and requirements.txt for rationale)
# ---------------------------------------------------------------------------

$PythonVersion   = '3.12.10'
$PythonZipName   = "python-$PythonVersion-embed-amd64.zip"
$PythonZipUrl    = "https://www.python.org/ftp/python/$PythonVersion/$PythonZipName"
# SHA-256 computed locally from the file served at $PythonZipUrl at pin time.
$PythonZipSha256 = '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3'

$GetPipUrl = 'https://bootstrap.pypa.io/get-pip.py'

$WebView2ClientId = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$WebView2InfoUrl  = 'https://developer.microsoft.com/en-us/microsoft-edge/webview2/'

# ---------------------------------------------------------------------------
# Bilingual console helpers
# ---------------------------------------------------------------------------

function Write-Info {
    param([Parameter(Mandatory)] [string] $En, [Parameter(Mandatory)] [string] $Ja)
    Write-Host "[INFO] $En" -ForegroundColor Cyan
    Write-Host "[INFO] $Ja" -ForegroundColor Cyan
}

function Write-Warn2 {
    param([Parameter(Mandatory)] [string] $En, [Parameter(Mandatory)] [string] $Ja)
    Write-Host "[WARN] $En" -ForegroundColor Yellow
    Write-Host "[WARN] $Ja" -ForegroundColor Yellow
}

function Invoke-Failure {
    param([Parameter(Mandatory)] [string] $En, [Parameter(Mandatory)] [string] $Ja)
    Write-Host "[ERROR] $En" -ForegroundColor Red
    Write-Host "[ERROR] $Ja" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Path resolution (script may be launched from any working directory)
# ---------------------------------------------------------------------------

$ScriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($ScriptDir)) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

try {
    # $ScriptDir is .developer/windows-app; the repo root is two levels up.
    $RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).ProviderPath
} catch {
    Invoke-Failure `
        -En "Could not resolve the repository root from script location '$ScriptDir'." `
        -Ja "スクリプトの場所 '$ScriptDir' からリポジトリルートを解決できませんでした。"
}

$RequirementsPath = Join-Path $ScriptDir 'requirements.txt'
$RuntimeDir       = Join-Path $RepoRoot '.developer\data\vendor\windows-runtime'
$PythonDir        = Join-Path $RuntimeDir 'python'
$PythonExe        = Join-Path $PythonDir 'python.exe'

if (-not (Test-Path -LiteralPath $RequirementsPath)) {
    Invoke-Failure `
        -En "requirements.txt not found at '$RequirementsPath'." `
        -Ja "requirements.txt が '$RequirementsPath' に見つかりません。"
}

Write-Info `
    -En "Perseus Local Reader Windows runtime bootstrap starting." `
    -Ja "Perseus Local Reader の Windows ランタイムのセットアップを開始します。"
Write-Host "  repo root : $RepoRoot"
Write-Host "  runtime   : $PythonDir"

# ---------------------------------------------------------------------------
# Idempotency fast path: already fully set up?
# ---------------------------------------------------------------------------

function Test-PythonRuntimeReady {
    if (-not (Test-Path -LiteralPath $PythonExe)) {
        return $false
    }
    try {
        & $PythonExe -c "import webview" *> $null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

if (Test-PythonRuntimeReady) {
    Write-Info `
        -En "Runtime already set up (python.exe and pywebview present). Nothing to do." `
        -Ja "ランタイムは既に構築済みです(python.exe と pywebview を確認)。処理は不要です。"
    exit 0
}

# ---------------------------------------------------------------------------
# Platform checks
# ---------------------------------------------------------------------------

if (-not [Environment]::Is64BitOperatingSystem) {
    Invoke-Failure `
        -En "This bootstrap only supports 64-bit Windows (x64). A 32-bit OS was detected." `
        -Ja "このセットアップは 64 ビット版 Windows (x64) のみに対応しています。32 ビット OS を検出しました。"
}

try {
    [Net.ServicePointManager]::SecurityProtocol = `
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
    Invoke-Failure `
        -En "Failed to enable TLS 1.2 for downloads: $($_.Exception.Message)" `
        -Ja "ダウンロード用の TLS 1.2 の有効化に失敗しました: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# Download helper: temp file -> verify -> rename (safe to retry after a
# failed/interrupted run).
# ---------------------------------------------------------------------------

function Get-VerifiedFile {
    param(
        [Parameter(Mandatory)] [string] $Url,
        [Parameter(Mandatory)] [string] $Destination,
        [string] $ExpectedSha256
    )

    $tempPath = "$Destination.download"
    if (Test-Path -LiteralPath $tempPath) {
        Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }

    $destDir = Split-Path -Parent $Destination
    if (-not (Test-Path -LiteralPath $destDir)) {
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    }

    Write-Info -En "Downloading $Url" -Ja "$Url をダウンロードしています"
    try {
        Invoke-WebRequest -Uri $Url -OutFile $tempPath -UseBasicParsing
    } catch {
        Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
        Invoke-Failure `
            -En "Download failed for $Url ($($_.Exception.Message)). Check your internet connection and retry." `
            -Ja "$Url のダウンロードに失敗しました($($_.Exception.Message))。インターネット接続を確認して再実行してください。"
    }

    if ($ExpectedSha256) {
        $actual = (Get-FileHash -LiteralPath $tempPath -Algorithm SHA256).Hash
        if ($actual -ne $ExpectedSha256) {
            Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
            Invoke-Failure `
                -En "Checksum mismatch for $Url. Expected $ExpectedSha256 but got $actual. The download may be corrupt or tampered; please retry." `
                -Ja "$Url のチェックサムが一致しません。期待値 $ExpectedSha256 に対し実際は $actual でした。ダウンロードが壊れているか改ざんされている可能性があります。再実行してください。"
        }
    }

    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    }
    Move-Item -LiteralPath $tempPath -Destination $Destination -Force
}

# ---------------------------------------------------------------------------
# Main setup (wrapped so unexpected errors still produce a bilingual message)
# ---------------------------------------------------------------------------

try {
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

    if (-not (Test-Path -LiteralPath $PythonExe)) {
        Write-Info `
            -En "Fetching embeddable Python $PythonVersion (amd64)." `
            -Ja "組み込み Python $PythonVersion (amd64) を取得します。"

        $zipPath = Join-Path $RuntimeDir $PythonZipName
        Get-VerifiedFile -Url $PythonZipUrl -Destination $zipPath -ExpectedSha256 $PythonZipSha256

        New-Item -ItemType Directory -Force -Path $PythonDir | Out-Null
        Write-Info -En "Extracting Python runtime." -Ja "Python ランタイムを展開しています。"
        Expand-Archive -LiteralPath $zipPath -DestinationPath $PythonDir -Force

        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue

        if (-not (Test-Path -LiteralPath $PythonExe)) {
            Invoke-Failure `
                -En "python.exe was not found after extraction. The embeddable package layout may have changed." `
                -Ja "展開後に python.exe が見つかりませんでした。組み込みパッケージの構成が変わった可能性があります。"
        }
    } else {
        Write-Info `
            -En "Embeddable Python already extracted; skipping download." `
            -Ja "組み込み Python は展開済みのため、ダウンロードをスキップします。"
    }

    # Enable "import site" in python3XX._pth so pip-installed packages
    # (site-packages) are importable. Embeddable Python ships this commented
    # out by default. Idempotent: a no-op if already enabled.
    $verParts = $PythonVersion.Split('.')
    $pthFileName = "python$($verParts[0])$($verParts[1])._pth"
    $pthPath = Join-Path $PythonDir $pthFileName

    if (-not (Test-Path -LiteralPath $pthPath)) {
        Invoke-Failure `
            -En "Expected _pth file '$pthFileName' not found under '$PythonDir'." `
            -Ja "想定される _pth ファイル '$pthFileName' が '$PythonDir' 内に見つかりません。"
    }

    $pthLines = Get-Content -LiteralPath $pthPath
    $pthChanged = $false
    $newPthLines = foreach ($line in $pthLines) {
        if ($line.Trim() -eq '#import site') {
            $pthChanged = $true
            'import site'
        } else {
            $line
        }
    }

    if ($pthChanged) {
        Set-Content -LiteralPath $pthPath -Value $newPthLines -Encoding ascii
        Write-Info `
            -En "Enabled site-packages in $pthFileName." `
            -Ja "$pthFileName 内で site-packages を有効化しました。"
    } else {
        Write-Info `
            -En "$pthFileName already has site-packages enabled; skipping." `
            -Ja "$pthFileName は既に site-packages が有効なため、スキップします。"
    }

    # Bootstrap pip if it is not already usable.
    $pipReady = $false
    try {
        & $PythonExe -m pip --version *> $null
        $pipReady = ($LASTEXITCODE -eq 0)
    } catch {
        $pipReady = $false
    }

    if (-not $pipReady) {
        Write-Info -En "Installing pip." -Ja "pip を導入しています。"
        $getPipPath = Join-Path $RuntimeDir 'get-pip.py'
        Get-VerifiedFile -Url $GetPipUrl -Destination $getPipPath

        & $PythonExe $getPipPath --no-warn-script-location
        $getPipExit = $LASTEXITCODE
        Remove-Item -LiteralPath $getPipPath -Force -ErrorAction SilentlyContinue

        if ($getPipExit -ne 0) {
            Invoke-Failure `
                -En "pip installation failed (exit code $getPipExit)." `
                -Ja "pip の導入に失敗しました(終了コード $getPipExit)。"
        }
    } else {
        Write-Info -En "pip already installed; skipping." -Ja "pip は導入済みのため、スキップします。"
    }

    # Install pinned dependencies (pywebview). "pip install -r" is itself
    # idempotent, so this always runs to catch a partially-completed prior
    # attempt.
    Write-Info `
        -En "Installing dependencies from requirements.txt." `
        -Ja "requirements.txt の依存関係をインストールしています。"
    & $PythonExe -m pip install --disable-pip-version-check --upgrade setuptools wheel
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] pip install setuptools wheel failed (exit code $LASTEXITCODE)." -ForegroundColor Red
        Write-Host "[ERROR] setuptools / wheel のインストールに失敗しました(終了コード $LASTEXITCODE)。" -ForegroundColor Red
        exit $LASTEXITCODE
    }

    & $PythonExe -m pip install --disable-pip-version-check --no-build-isolation -r $RequirementsPath
    if ($LASTEXITCODE -ne 0) {
        Invoke-Failure `
            -En "pip install -r requirements.txt failed (exit code $LASTEXITCODE)." `
            -Ja "requirements.txt のインストールに失敗しました(終了コード $LASTEXITCODE)。"
    }

    if (-not (Test-PythonRuntimeReady)) {
        Invoke-Failure `
            -En "Setup finished but 'import webview' still fails. Delete .developer\data\vendor\windows-runtime\ and retry." `
            -Ja "セットアップは完了しましたが 'import webview' が失敗しています。.developer\data\vendor\windows-runtime\ を削除して再実行してください。"
    }

    # WebView2 Runtime check: warning only, never aborts (Windows 11 ships it
    # preinstalled; Windows 10 may need a one-time install).
    $wv2RegistryPaths = @(
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$WebView2ClientId",
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$WebView2ClientId",
        "HKCU:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$WebView2ClientId",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$WebView2ClientId"
    )

    $wv2Version = $null
    foreach ($regPath in $wv2RegistryPaths) {
        if (Test-Path -LiteralPath $regPath) {
            $prop = Get-ItemProperty -LiteralPath $regPath -Name 'pv' -ErrorAction SilentlyContinue
            if ($prop -and $prop.pv) {
                $wv2Version = $prop.pv
                break
            }
        }
    }

    if ($wv2Version) {
        Write-Info `
            -En "Microsoft Edge WebView2 Runtime detected (version $wv2Version)." `
            -Ja "Microsoft Edge WebView2 Runtime を検出しました(バージョン $wv2Version)。"
    } else {
        Write-Warn2 `
            -En "Microsoft Edge WebView2 Runtime was not detected. It is preinstalled on Windows 11, but Windows 10 may be missing it. If the reader window fails to open, install it from: $WebView2InfoUrl" `
            -Ja "Microsoft Edge WebView2 Runtime が見つかりませんでした。Windows 11 にはプリインストールされていますが、Windows 10 では入っていない場合があります。Reader のウィンドウが開かない場合は、次のページからインストールしてください: $WebView2InfoUrl"
    }

    Write-Info `
        -En "Windows runtime bootstrap completed successfully." `
        -Ja "Windows ランタイムのセットアップが正常に完了しました。"
    exit 0

} catch {
    Invoke-Failure `
        -En "Unexpected error during bootstrap: $($_.Exception.Message)" `
        -Ja "セットアップ中に予期しないエラーが発生しました: $($_.Exception.Message)"
}
