# ============================================================
# 考研日历 PWA · 一键启动本地服务 + Chrome
# 用法: 右键 → "使用 PowerShell 运行"   或   双击
# 端口: 8765 (固定, 避免端口冲突)
# ============================================================
$ErrorActionPreference = 'Stop'
$port = 8765
$dir = $PSScriptRoot
if (-not $dir) { $dir = (Get-Location).Path }
$url = "http://localhost:$port/app.html"

Write-Host ""
Write-Host "  ╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   考研日历 PWA · 一键启动                    ║" -ForegroundColor Cyan
Write-Host "  ╚════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  📂 目录: $dir" -ForegroundColor Gray
Write-Host "  🌐 地址: $url" -ForegroundColor Green
Write-Host ""

# ---- 1) 找 Chrome ----
$chrome = $null
$candidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
foreach ($p in $candidates) {
  if ($p -and (Test-Path $p)) { $chrome = $p; break }
}
if (-not $chrome) {
  Write-Host "  ❌ 未找到 Chrome / Edge" -ForegroundColor Red
  Write-Host "  请安装 Chrome (https://google.com/chrome) 或用 Edge 打开: $url" -ForegroundColor Yellow
  Write-Host ""
  Read-Host "  按 Enter 退出"
  exit 1
}
$browserName = if ($chrome -like '*msedge*') { 'Edge' } else { 'Chrome' }
Write-Host "  ✅ 找到 $browserName : $chrome" -ForegroundColor Green

# ---- 2) 检查端口 ----
$portInUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
  Write-Host "  ⚠️  端口 $port 已被占用 (可能是上次没关)。直接打开浏览器..." -ForegroundColor Yellow
  Start-Process $chrome "--app=`"$url`"" -ErrorAction SilentlyContinue
  Write-Host "  ✅ 已在 $browserName 打开 PWA" -ForegroundColor Green
  Read-Host "  按 Enter 关闭此窗口 (浏览器不会关闭)"
  exit 0
}

# ---- 3) 起本地 HTTP server (优先 Python, 退到 npx http-server) ----
$serverProc = $null
$pythonCmd = $null
foreach ($p in @('python', 'python3', 'py')) {
  $cmd = Get-Command $p -ErrorAction SilentlyContinue
  if ($cmd) { $pythonCmd = $p; break }
}

if ($pythonCmd) {
  Write-Host "  ✅ 找到 Python: $pythonCmd" -ForegroundColor Green
  Write-Host "  🚀 启动 HTTP 服务 (端口 $port) ..." -ForegroundColor Cyan
  $serverProc = Start-Process $pythonCmd -ArgumentList "-m","http.server",$port -WorkingDirectory $dir -PassThru -NoNewWindow
  Start-Sleep -Seconds 1
} else {
  $npx = Get-Command npx -ErrorAction SilentlyContinue
  if ($npx) {
    Write-Host "  ⚠️  未找到 Python, 用 npx http-server ..." -ForegroundColor Yellow
    $serverProc = Start-Process npx -ArgumentList "-y","http-server","-p",$port,"-c-1","$dir" -PassThru -NoNewWindow
    Start-Sleep -Seconds 3
  } else {
    Write-Host "  ❌ 未找到 Python 或 Node.js (npx)" -ForegroundColor Red
    Write-Host "  请先装 Python (https://python.org) 或 Node.js (https://nodejs.org)" -ForegroundColor Yellow
    Read-Host "  按 Enter 退出"
    exit 1
  }
}

# ---- 4) 打开 Chrome (PWA 模式) ----
Write-Host "  🌐 打开 $browserName (PWA 模式) ..." -ForegroundColor Cyan
Start-Process $chrome "--app=`"$url`"" -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "  ╔════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║  ✅ PWA 已启动!                              ║" -ForegroundColor Green
Write-Host "  ║  · 首次停留 30s+, 顶部会出现"安装到 Chrome"    ║" -ForegroundColor Green
Write-Host "  ║  · 点安装, 之后从开始菜单/任务栏启动            ║" -ForegroundColor Green
Write-Host "  ║  · 关闭此窗口不会停止 PWA (会停服务)             ║" -ForegroundColor Green
Write-Host "  ╚════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  ⚠️  不要关闭此 PowerShell 窗口! 关闭窗口 = 停止服务" -ForegroundColor Yellow
Write-Host "  停止服务: Ctrl+C, 或直接关闭此窗口" -ForegroundColor Gray
Write-Host ""

# ---- 5) 阻塞保持服务运行, Ctrl+C 退出 ----
try {
  while ($true) {
    Start-Sleep -Seconds 60
    if ($serverProc -and $serverProc.HasExited) {
      Write-Host "  ⚠️  HTTP 服务已退出" -ForegroundColor Red
      break
    }
  }
} finally {
  if ($serverProc -and -not $serverProc.HasExited) {
    Write-Host ""
    Write-Host "  🛑 关闭 HTTP 服务 ..." -ForegroundColor Yellow
    Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
  }
}
