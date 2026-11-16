<#
  EchoLab 本地静态服务器（零依赖，Windows PowerShell 5.1+ / PowerShell 7 均可）
  - GET/HEAD 静态文件，支持 Byte Range（视频拖动必需）
  - POST /api/ai 转发到 OpenAI 兼容接口（浏览器直连会被 CORS 拦，这里绕过去）
  用法: powershell -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8777
#>
param(
  [int]$Port = 8777,
  [string]$Root = "",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

if (-not $Root) {
  $Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
$Root = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
. (Join-Path $PSScriptRoot 'update.ps1')
. (Join-Path $PSScriptRoot 'google-drive.ps1')

$MIME = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".mjs"  = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".mp4"  = "video/mp4"
  ".webm" = "video/webm"
  ".mp3"  = "audio/mpeg"
  ".woff2" = "font/woff2"
  ".txt"  = "text/plain; charset=utf-8"
  ".md"   = "text/markdown; charset=utf-8"
}

function Write-Response {
  param(
    $Stream, [int]$Status, [string]$StatusText, [byte[]]$Body,
    [string]$ContentType, [hashtable]$Extra = @{}, [bool]$HeadOnly = $false
  )
  if ($null -eq $Body) { $Body = [byte[]]@() }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("HTTP/1.1 $Status $StatusText`r`n")
  [void]$sb.Append("Server: EchoLab`r`n")
  [void]$sb.Append("Connection: close`r`n")
  if ($ContentType) { [void]$sb.Append("Content-Type: $ContentType`r`n") }
  [void]$sb.Append("Content-Length: $($Body.Length)`r`n")
  [void]$sb.Append("Cache-Control: no-store`r`n")
  foreach ($k in $Extra.Keys) { [void]$sb.Append("${k}: $($Extra[$k])`r`n") }
  [void]$sb.Append("`r`n")

  $header = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
  $Stream.Write($header, 0, $header.Length)
  if (-not $HeadOnly -and $Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
  $Stream.Flush()
}

function Send-Json {
  param($Stream, [int]$Status, [string]$StatusText, $Object, [bool]$HeadOnly)
  $txt = if ($Object -is [string]) { $Object } else { $Object | ConvertTo-Json -Depth 12 -Compress }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($txt)
  Write-Response -Stream $Stream -Status $Status -StatusText $StatusText -Body $bytes `
    -ContentType "application/json; charset=utf-8" -HeadOnly $HeadOnly
}

# ---------------------------------------------------------------- AI 代理
function Invoke-AiProxy {
  param($Stream, [byte[]]$Body, [bool]$HeadOnly)

  try {
    $json = [System.Text.Encoding]::UTF8.GetString($Body) | ConvertFrom-Json
  } catch {
    Send-Json $Stream 400 "Bad Request" @{ error = @{ message = "invalid json" } } $HeadOnly
    return
  }

  $url = [string]$json.url
  if (-not $url -or $url -notmatch '^https?://') {
    Send-Json $Stream 400 "Bad Request" @{ error = @{ message = "url required" } } $HeadOnly
    return
  }

  $isGet = ([string]$json.method -eq "GET")

  try {
    if (-not ("System.Net.Http.HttpClient" -as [type])) {
      Add-Type -AssemblyName System.Net.Http
    }

    $client = New-Object System.Net.Http.HttpClient
    $client.Timeout = [TimeSpan]::FromSeconds(150)
    $httpMethod = New-Object System.Net.Http.HttpMethod($(if ($isGet) { "GET" } else { "POST" }))
    $req = New-Object System.Net.Http.HttpRequestMessage($httpMethod, $url)

    if ($json.key) { [void]$req.Headers.TryAddWithoutValidation("Authorization", "Bearer $($json.key)") }
    if ($json.headers) {
      foreach ($prop in $json.headers.PSObject.Properties) {
        [void]$req.Headers.TryAddWithoutValidation($prop.Name, [string]$prop.Value)
      }
    }

    if (-not $isGet) {
      $payload = [ordered]@{}
      if ($json.model) { $payload["model"] = [string]$json.model }
      $payload["messages"] = $json.messages
      if ($null -ne $json.temperature) { $payload["temperature"] = $json.temperature }
      if ($null -ne $json.max_tokens) { $payload["max_tokens"] = $json.max_tokens }
      $bodyText = $payload | ConvertTo-Json -Depth 20 -Compress
      $content = New-Object System.Net.Http.StringContent($bodyText, [System.Text.Encoding]::UTF8, "application/json")
      $req.Content = $content
    }

    $resp = $client.SendAsync($req).GetAwaiter().GetResult()
    $bytes = $resp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $status = [int]$resp.StatusCode

    if ($status -ge 200 -and $status -lt 300) {
      Write-Response -Stream $Stream -Status 200 -StatusText "OK" -Body $bytes `
        -ContentType "application/json; charset=utf-8" -HeadOnly $HeadOnly
    } else {
      $text = [System.Text.Encoding]::UTF8.GetString($bytes)
      $msg = $text
      try {
        $parsed = $text | ConvertFrom-Json
        if ($parsed.error) {
          if ($parsed.error.message) { $msg = [string]$parsed.error.message }
          elseif ($parsed.error -is [string]) { $msg = $parsed.error }
        }
      } catch {}
      Send-Json $Stream $status "Upstream Error" @{
        error = @{ message = $msg; status = $status; url = $url; fromBody = [bool]$text.Trim() }
      } $HeadOnly
    }

    $req.Dispose()
    $client.Dispose()
  } catch {
    $msg = $_.Exception.Message
    if ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message }
    Send-Json $Stream 502 "Proxy Error" @{
      error = @{ message = $msg; status = 502; url = $url; fromBody = $false }
    } $HeadOnly
  }
}
# ---------------------------------------------------------------- 启动
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try {
  $listener.Start()
} catch {
  Write-Host "[EchoLab] 端口 $Port 已被占用，可能已经在运行。" -ForegroundColor Yellow
  Write-Host "         直接打开 http://127.0.0.1:$Port/"
  Start-Sleep -Seconds 4
  exit 0
}

Write-Host ""
Write-Host "  EchoLab · 回声跟读" -ForegroundColor Yellow
Write-Host "  ->  http://127.0.0.1:$Port/" -ForegroundColor Cyan
Write-Host "  目录: $Root"
Write-Host "  AI 代理: POST /api/ai"
Write-Host "  按 Ctrl+C 结束" -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port/" | Out-Null }

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 15000
      $client.SendTimeout = 180000
      $stream = $client.GetStream()

      # --- 读到 header 结束（\r\n\r\n），保留已读到的 body 前缀 ---
      $buf = New-Object byte[] 8192
      $ms = New-Object System.IO.MemoryStream
      $headerEnd = -1
      while ($headerEnd -lt 0 -and $ms.Length -lt 131072) {
        $n = $stream.Read($buf, 0, $buf.Length)
        if ($n -le 0) { break }
        $ms.Write($buf, 0, $n)
        $arr = $ms.ToArray()
        for ($i = 0; $i -lt $arr.Length - 3; $i++) {
          if ($arr[$i] -eq 13 -and $arr[$i + 1] -eq 10 -and $arr[$i + 2] -eq 13 -and $arr[$i + 3] -eq 10) {
            $headerEnd = $i
            break
          }
        }
      }
      if ($headerEnd -lt 0) { continue }

      $all = $ms.ToArray()
      $headText = [System.Text.Encoding]::ASCII.GetString($all, 0, $headerEnd)
      $bodyPrefix = if ($all.Length -gt $headerEnd + 4) {
        $seg = New-Object byte[] ($all.Length - $headerEnd - 4)
        [Array]::Copy($all, $headerEnd + 4, $seg, 0, $seg.Length)
        $seg
      } else { [byte[]]@() }

      $lines = $headText -split "`r`n"
      $parts = $lines[0] -split " "
      if ($parts.Length -lt 2) { continue }
      $method = $parts[0].ToUpper()
      $target = $parts[1]

      $headers = @{}
      for ($i = 1; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        if (-not $line) { break }
        $idx = $line.IndexOf(":")
        if ($idx -gt 0) { $headers[$line.Substring(0, $idx).Trim().ToLower()] = $line.Substring($idx + 1).Trim() }
      }

      $headOnly = ($method -eq "HEAD")
      $path = $target
      $q = $path.IndexOf("?")
      if ($q -ge 0) { $path = $path.Substring(0, $q) }

      # Google OAuth callbacks are protected by a one-time random state and PKCE.
      if ($path -eq '/api/drive/callback' -and $method -eq 'GET') {
        if ($headers['host'] -cne "127.0.0.1:$Port") { Send-Json $stream 403 'Forbidden' @{ error = 'Forbidden' } $false; continue }
        try {
          $params = @{}
          if ($q -ge 0) { foreach ($pair in ($target.Substring($q+1) -split '&')) { $kv=$pair -split '=',2; if ($kv.Length -eq 2) { $params[[Uri]::UnescapeDataString($kv[0])] = [Uri]::UnescapeDataString($kv[1].Replace('+',' ')) } } }
          Complete-DriveAuthorization $params['state'] $params['code']
          $html = '<!doctype html><meta charset="utf-8"><title>EchoLab</title><p>Google Drive connected. You can close this window and return to EchoLab.</p>'
          Write-Response $stream 200 'OK' ([Text.Encoding]::UTF8.GetBytes($html)) 'text/html; charset=utf-8' @{ 'Referrer-Policy'='no-referrer'; 'Content-Security-Policy'="default-src 'none'" } $false
        } catch { Send-Json $stream 400 'Authorization Error' @{ error='Google authorization failed or expired. Return to EchoLab and try again.' } $false }
        continue
      }
      if ($path -in @('/api/drive/start','/api/drive/token','/api/drive/disconnect')) {
        $allowedHosts = @("127.0.0.1:$Port", "localhost:$Port")
        if ($method -ne 'POST' -or $headers['host'] -notin $allowedHosts -or $headers['origin'] -cne "http://$($headers['host'])" -or $headers['x-echolab-drive'] -cne '1') { Send-Json $stream 403 'Forbidden' @{ error='Forbidden' } $false; continue }
        try {
          if ($path -eq '/api/drive/start') { Send-Json $stream 200 'OK' (New-DriveAuthorization $Port) $false }
          elseif ($path -eq '/api/drive/token') { $access=Get-DriveAccessToken; Send-Json $stream 200 'OK' @{ connected=[bool]$access; accessToken=$access } $false }
          else { Disconnect-Drive; Send-Json $stream 200 'OK' @{ connected=$false } $false }
        } catch { Send-Json $stream 502 'Drive Error' @{ error='Google authorization failed. Please reconnect and check network access.' } $false }
        continue
      }

      if ($path -eq '/api/update/check' -or $path -eq '/api/update/install') {
        $allowedHosts = @("127.0.0.1:$Port", "localhost:$Port")
        if ($method -ne 'POST' -or $headers['host'] -notin $allowedHosts -or
            $headers['origin'] -cne "http://$($headers['host'])" -or $headers['x-echolab-update'] -cne '1') {
          Send-Json $stream 403 'Forbidden' @{ error = '更新只能从本机 EchoLab 页面发起。' } $false
          continue
        }
        try {
          if ($path -eq '/api/update/check') {
            Send-Json $stream 200 'OK' (Get-EchoLabUpdate $Root) $false
          } else {
            $installedVersion = Install-EchoLabUpdate $Root
            Send-Json $stream 200 'OK' @{ version = $installedVersion } $false
            exit 42
          }
        } catch {
          Send-Json $stream 502 'Update Error' @{ error = $_.Exception.Message } $false
        }
        continue
      }

      # --- AI 代理 ---
      if ($method -eq "POST" -and $path -eq "/api/ai") {
        $len = 0
        if ($headers["content-length"]) { $len = [int]$headers["content-length"] }
        $body = New-Object byte[] $len
        $have = [Math]::Min($bodyPrefix.Length, $len)
        if ($have -gt 0) { [Array]::Copy($bodyPrefix, 0, $body, 0, $have) }
        while ($have -lt $len) {
          $n = $stream.Read($body, $have, $len - $have)
          if ($n -le 0) { break }
          $have += $n
        }
        Invoke-AiProxy -Stream $stream -Body $body -HeadOnly $headOnly
        continue
      }

      if ($method -ne "GET" -and $method -ne "HEAD") {
        Send-Json $stream 405 "Method Not Allowed" @{ error = "method not allowed" } $headOnly
        continue
      }

      # --- 静态文件 ---
      $path = [System.Uri]::UnescapeDataString($path)
      if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }
      $path = $path.Replace("/", "\")

      $full = [System.IO.Path]::GetFullPath((Join-Path $Root $path.TrimStart('\')))
      if (-not $full.StartsWith($Root + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Json $stream 403 "Forbidden" @{ error = "forbidden" } $headOnly
        continue
      }
      if ((Test-Path -LiteralPath $full -PathType Container)) { $full = Join-Path $full "index.html" }
      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        Send-Json $stream 404 "Not Found" @{ error = "not found" } $headOnly
        continue
      }

      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ctype = $MIME[$ext]
      if (-not $ctype) { $ctype = "application/octet-stream" }
      $len = (Get-Item -LiteralPath $full).Length
      $rangeHeader = $headers["range"]

      if ($rangeHeader -and $rangeHeader -match "bytes=(\d*)-(\d*)") {
        $start = 0
        $end = $len - 1
        if ($matches[1] -ne "") { $start = [int64]$matches[1] }
        if ($matches[2] -ne "") { $end = [int64]$matches[2] }
        if ($start -ge $len) { continue }
        if ($end -ge $len) { $end = $len - 1 }
        $count = $end - $start + 1

        $fs = [System.IO.File]::Open($full, "Open", "Read", "ReadWrite")
        try {
          [void]$fs.Seek($start, "Begin")
          $chunk = New-Object byte[] $count
          $offset = 0
          while ($offset -lt $count) {
            $n = $fs.Read($chunk, $offset, $count - $offset)
            if ($n -le 0) { break }
            $offset += $n
          }
        } finally { $fs.Dispose() }

        Write-Response -Stream $stream -Status 206 -StatusText "Partial Content" -Body $chunk `
          -ContentType $ctype -HeadOnly $headOnly -Extra @{
            "Accept-Ranges" = "bytes"
            "Content-Range" = "bytes $start-$end/$len"
          }
        continue
      }

      $bytes = [System.IO.File]::ReadAllBytes($full)
      Write-Response -Stream $stream -Status 200 -StatusText "OK" -Body $bytes `
        -ContentType $ctype -HeadOnly $headOnly -Extra @{ "Accept-Ranges" = "bytes" }
    } catch {
      # 单连接异常不影响整体
    } finally {
      try { $client.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
