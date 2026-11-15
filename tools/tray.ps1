param([int]$Port = 8777)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:$Port/"
$mutexName = "Local\EchoLab-Tray-$Port"
$created = $false
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$created)
if (-not $created) {
  Start-Process $url
  $mutex.Dispose()
  exit
}

$server = $null
$tray = $null
$timer = $null
$quitting = $false

function Start-EchoLabServer {
  $scriptPath = Join-Path $PSScriptRoot 'serve.ps1'
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), '-Port', $Port, '-NoBrowser')
  return Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru
}

try {
  $probe = New-Object System.Net.Sockets.TcpClient
  try {
    $connect = $probe.BeginConnect('127.0.0.1', $Port, $null, $null)
    $occupied = $connect.AsyncWaitHandle.WaitOne(300) -and $probe.Connected
  } finally { $probe.Close() }
  if ($occupied) {
    [System.Windows.Forms.MessageBox]::Show("端口 $Port 已被占用。请先退出正在运行的 EchoLab 或释放该端口。", 'EchoLab') | Out-Null
    exit 1
  }

  $bitmap = New-Object System.Drawing.Bitmap 32, 32
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(30, 85, 170))
  $brush = [System.Drawing.Brushes]::White
  $graphics.FillRectangle($brush, 5, 13, 3, 6)
  $graphics.FillRectangle($brush, 11, 8, 3, 16)
  $graphics.FillRectangle($brush, 17, 5, 3, 22)
  $graphics.FillRectangle($brush, 23, 11, 3, 10)
  $iconHandle = $bitmap.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
  $tray = New-Object System.Windows.Forms.NotifyIcon
  $tray.Icon = $icon
  $tray.Text = 'EchoLab'
  $menu = New-Object System.Windows.Forms.ContextMenuStrip
  $openItem = $menu.Items.Add('打开 EchoLab')
  $exitItem = $menu.Items.Add('退出')
  $openItem.add_Click({ Start-Process $url })
  $tray.add_DoubleClick({ Start-Process $url })
  $exitItem.add_Click({
    $script:quitting = $true
    if ($script:server -and -not $script:server.HasExited) {
      Stop-Process -Id $script:server.Id -ErrorAction SilentlyContinue
    }
    [System.Windows.Forms.Application]::ExitThread()
  })
  $tray.ContextMenuStrip = $menu
  $tray.Visible = $true
  $server = Start-EchoLabServer
  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = 700
  $timer.add_Tick({
    if ($script:quitting -or -not $script:server) { return }
    $script:server.Refresh()
    if ($script:server.HasExited) {
      $code = $script:server.ExitCode
      if ($code -eq 42) {
        $script:server.Dispose()
        $script:server = Start-EchoLabServer
      } else {
        $script:quitting = $true
        $script:timer.Stop()
        [System.Windows.Forms.MessageBox]::Show("EchoLab 服务已停止（代码 $code）。请检查端口和启动配置。", 'EchoLab') | Out-Null
        [System.Windows.Forms.Application]::ExitThread()
      }
    }
  })
  $timer.Start()
  Start-Process $url
  [System.Windows.Forms.Application]::Run()
} finally {
  if ($timer) { $timer.Stop(); $timer.Dispose() }
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
  if ($tray) { $tray.Visible = $false; $tray.Dispose() }
  if ($menu) { $menu.Dispose() }
  if ($graphics) { $graphics.Dispose() }
  if ($icon) { $icon.Dispose() }
  if ($bitmap) { $bitmap.Dispose() }
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
