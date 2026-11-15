$script:EchoLabReleaseApi = 'https://api.github.com/repos/Acerocloud/echolab'

function New-EchoLabReleaseClient {
  Add-Type -AssemblyName System.Net.Http
  $client = New-Object System.Net.Http.HttpClient
  $client.Timeout = [TimeSpan]::FromSeconds(20)
  $client.DefaultRequestHeaders.UserAgent.ParseAdd('EchoLab-Updater/1')
  $client.DefaultRequestHeaders.Accept.ParseAdd('application/vnd.github+json')
  $token = $env:GH_TOKEN
  if (-not $token) { $token = $env:GITHUB_TOKEN }
  if (-not $token -and (Get-Command git -ErrorAction SilentlyContinue)) {
    $oldPrompt = $env:GIT_TERMINAL_PROMPT
    $oldInteractive = $env:GCM_INTERACTIVE
    try {
      $env:GIT_TERMINAL_PROMPT = '0'
      $env:GCM_INTERACTIVE = 'never'
      $line = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null |
        Where-Object { $_ -like 'password=*' } | Select-Object -First 1
      if ($line) { $token = $line.Substring(9) }
    } catch {
      # A missing credential still permits an anonymous release check.
    } finally {
      $env:GIT_TERMINAL_PROMPT = $oldPrompt
      $env:GCM_INTERACTIVE = $oldInteractive
    }
  }
  if ($token) {
    $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $token)
  }
  return $client
}

function Get-EchoLabRelease($Client, $AppRoot) {
  $current = (Get-Content -LiteralPath (Join-Path $AppRoot 'package.json') -Raw | ConvertFrom-Json).version
  try {
    $json = $Client.GetStringAsync("$script:EchoLabReleaseApi/releases/latest").GetAwaiter().GetResult()
  } catch {
    if ($_.Exception.ToString() -match '\b(401|403|404)\b') {
      throw 'GitHub release is unavailable. Sign in to Git for Windows with an account that has access to Acerocloud/echolab.'
    }
    throw 'Could not reach GitHub. Check your connection and try again.'
  }
  $release = $json | ConvertFrom-Json
  if ($release.tag_name -cnotmatch '^v(\d+\.\d+\.\d+)$') { throw 'Invalid release version.' }
  $latest = $Matches[1]
  $asset = $release.assets | Where-Object { $_.name -ceq "EchoLab-v$latest.zip" } | Select-Object -First 1
  return @{
    current = $current; latest = $latest; available = ([version]$latest -gt [version]$current); asset = $asset
  }
}

function Get-EchoLabUpdate($AppRoot) {
  $client = New-EchoLabReleaseClient
  try {
    $release = Get-EchoLabRelease $client $AppRoot
    $release.Remove('asset')
    $release['installable'] = -not (Test-Path -LiteralPath (Join-Path $AppRoot '.git'))
    return $release
  } finally { $client.Dispose() }
}

function Install-EchoLabUpdate($AppRoot) {
  if (Test-Path -LiteralPath (Join-Path $AppRoot '.git')) { throw 'This is a Git checkout. Update it with git pull.' }
  $client = New-EchoLabReleaseClient
  $scratch = Join-Path ([IO.Path]::GetTempPath()) ('EchoLab-' + [guid]::NewGuid())
  $backup = Join-Path $scratch 'backup'
  $touched = New-Object 'System.Collections.Generic.List[string]'
  $keepBackup = $false
  try {
    $release = Get-EchoLabRelease $client $AppRoot
    if (-not $release.available) { throw 'EchoLab is already up to date.' }
    $asset = $release.asset
    if (-not $asset -or $asset.state -ne 'uploaded' -or $asset.digest -notmatch '^sha256:[a-f0-9]{64}$' -or
        $asset.size -le 0 -or $asset.size -gt 50MB -or [string]$asset.id -notmatch '^\d+$') {
      throw 'The release archive or its checksum is missing.'
    }
    New-Item -ItemType Directory -Path $scratch | Out-Null
    $archive = Join-Path $scratch 'release.zip'
    $client.DefaultRequestHeaders.Accept.Clear()
    $client.DefaultRequestHeaders.Accept.ParseAdd('application/octet-stream')
    $bytes = $client.GetByteArrayAsync("$script:EchoLabReleaseApi/releases/assets/$($asset.id)").GetAwaiter().GetResult()
    [IO.File]::WriteAllBytes($archive, $bytes)
    if ($bytes.Length -ne $asset.size -or ('sha256:' + (Get-FileHash -LiteralPath $archive).Hash) -ine $asset.digest) {
      throw 'The downloaded archive failed checksum verification.'
    }
    $unpacked = Join-Path $scratch 'unpacked'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpacked
    $source = Join-Path $unpacked "EchoLab-v$($release.latest)"
    foreach ($required in 'package.json', 'index.html', 'start.bat', 'tools/serve.ps1', 'tools/update.ps1') {
      if (-not (Test-Path -LiteralPath (Join-Path $source $required) -PathType Leaf)) { throw 'Incomplete release archive.' }
    }
    if ((Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw | ConvertFrom-Json).version -ne $release.latest) {
      throw 'The archive version does not match the release.'
    }
    $files = @(Get-ChildItem -LiteralPath $source -File -Recurse)
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($source.Length + 1)
      if ($relative -match '(^|[\\/])\.(?!gitignore$)' -or $file.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Unexpected file in release archive.'
      }
      $destination = Join-Path $AppRoot $relative
      $section = $relative
      while ($section) {
        $existing = Get-Item -LiteralPath (Join-Path $AppRoot $section) -Force -ErrorAction SilentlyContinue
        if ($existing -and ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
          throw 'The installation contains a linked file or directory.'
        }
        $section = Split-Path -Parent $section
      }
      if (Test-Path -LiteralPath $destination -PathType Container) { throw "A directory blocks the update: $relative" }
      if (Test-Path -LiteralPath $destination -PathType Leaf) {
        $saved = Join-Path $backup $relative
        [IO.Directory]::CreateDirectory((Split-Path -Parent $saved)) | Out-Null
        Copy-Item -LiteralPath $destination -Destination $saved
      }
    }
    # Write the version marker last, after all application files are in place.
    foreach ($file in ($files | Sort-Object { $_.FullName -eq (Join-Path $source 'package.json') })) {
      $relative = $file.FullName.Substring($source.Length + 1)
      $destination = Join-Path $AppRoot $relative
      [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
      $touched.Add($relative)
      Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    }
    return $release.latest
  } catch {
    $failure = $_
    foreach ($relative in $touched) {
      $destination = Join-Path $AppRoot $relative
      $saved = Join-Path $backup $relative
      try {
        if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination $destination -Force }
        elseif (Test-Path -LiteralPath $destination -PathType Leaf) { Remove-Item -LiteralPath $destination -Force }
      } catch { $keepBackup = $true }
    }
    if ($keepBackup) { throw "Update failed. Backup files are at $backup." }
    throw $failure
  } finally {
    $client.Dispose()
    if (-not $keepBackup -and (Test-Path -LiteralPath $scratch -PathType Container)) {
      $resolved = (Resolve-Path -LiteralPath $scratch).Path
      if ($resolved -ieq [IO.Path]::GetFullPath($scratch)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  }
}
