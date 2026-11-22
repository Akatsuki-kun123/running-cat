# Cài mod Running Cat cho Claude (Windows).
# Cách chạy (trong thư mục đã giải nén gói này):
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -CatZip "$HOME\Downloads\Cat 50+ Animations.zip"
param(
    [Parameter(Mandatory = $true)]
    [string]$CatZip
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'

function Stop-Install([string]$Message) {
    Write-Host ""
    Write-Host "LỖI: $Message" -ForegroundColor Red
    exit 1
}

function Find-Python {
    foreach ($name in @('python', 'py', 'python3')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -ne $cmd -and $cmd.Source -notlike '*WindowsApps*') { return $cmd.Source }
    }
    return $null
}

Write-Host "== Cài mod Running Cat ==" -ForegroundColor Cyan

# 1. Kiểm tra những thứ cần có
if (-not (Test-Path -LiteralPath $CatZip)) { Stop-Install "Không tìm thấy file mèo: $CatZip" }
$CatZip = (Resolve-Path -LiteralPath $CatZip).Path

$claude = Get-Command claude -ErrorAction SilentlyContinue
if ($null -eq $claude) { Stop-Install "Chưa có lệnh 'claude'. Cài Claude Code trước, mở lại PowerShell rồi chạy lại." }

$python = Find-Python
if ($null -eq $python) { Stop-Install "Chưa có Python. Cài từ https://www.python.org/downloads/ (tick 'Add python.exe to PATH'), mở lại PowerShell rồi chạy lại." }
Write-Host "Python: $python"

# 2. Pillow (thư viện đọc ảnh) cho tool tạo hình mèo
& $python -c "import PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Đang cài Pillow..."
    & $python -m pip install --user pillow
    if ($LASTEXITCODE -ne 0) { Stop-Install "Không cài được Pillow. Thử tự chạy: python -m pip install pillow" }
}

# 3. Chép gói vào chỗ cố định
$source = $PSScriptRoot
$dest = Join-Path $HOME '.claude\mods\running-cat-pack'
Write-Host "Chép mod vào $dest"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($item in @('.claude-plugin', 'running-cat', 'README.md', 'install.ps1')) {
    $from = Join-Path $source $item
    if ((Resolve-Path -LiteralPath $from).Path -ne (Join-Path $dest $item)) {
        Copy-Item -LiteralPath $from -Destination $dest -Recurse -Force
    }
}

# 4. Tạo hình mèo từ gói của Bow.Pixel
Write-Host "Tạo hình mèo..."
& $python (Join-Path $dest 'running-cat\tools\make_cat_frames.py') $CatZip
if ($LASTEXITCODE -ne 0) { Stop-Install "Không tạo được hình mèo (xem thông báo ở trên)." }

# 5. Đăng ký và cài mod cho mọi session
Write-Host "Đăng ký và cài mod..."
& claude plugin marketplace add $dest
if ($LASTEXITCODE -ne 0) { Write-Host "(Có thể đã đăng ký từ trước, tiếp tục.)" -ForegroundColor Yellow }
& claude plugin install running-cat@running-cat-mods --scope user
if ($LASTEXITCODE -ne 0) { Stop-Install "Không cài được mod. Thử: claude plugin install running-cat@running-cat-mods --scope user" }

Write-Host ""
Write-Host "Xong! Mở một session mới trong app Claude để thấy mèo." -ForegroundColor Green
