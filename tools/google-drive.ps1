# Windows-only OAuth for EchoLab. Refresh tokens are encrypted for the current Windows user.
$script:DriveClientId = '369284980666-33pkholrvbdslhaoaormd15dph9artfp.apps.googleusercontent.com'
$script:DriveScope = 'https://www.googleapis.com/auth/drive.appdata'
$script:DriveClientPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'EchoLab\google-oauth.json'
$script:DriveClientProtectedPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'EchoLab\google-oauth.dat'
$script:DriveTokenPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'EchoLab\drive-token.dat'
$script:DriveSession = $null
$script:DriveAccess = $null
$script:DriveExpires = [DateTime]::MinValue

function ConvertTo-UrlToken([byte[]]$Bytes) { return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
function New-DriveRandomToken([int]$Length = 32) { $b = New-Object byte[] $Length; $r = [Security.Cryptography.RandomNumberGenerator]::Create(); try { $r.GetBytes($b) } finally { $r.Dispose() }; return ConvertTo-UrlToken $b }
function New-DriveAuthorization([int]$Port) {
  $null = Read-DriveClientSecret
  $verifier = New-DriveRandomToken 48
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $challenge = ConvertTo-UrlToken ($sha.ComputeHash([Text.Encoding]::ASCII.GetBytes($verifier))) } finally { $sha.Dispose() }
  $state = New-DriveRandomToken 32
  $redirect = "http://127.0.0.1:$Port/api/drive/callback"
  $script:DriveSession = @{ State=$state; Verifier=$verifier; Redirect=$redirect; Created=[DateTime]::UtcNow }
  $p = [ordered]@{ client_id=$script:DriveClientId; redirect_uri=$redirect; response_type='code'; scope=$script:DriveScope; code_challenge=$challenge; code_challenge_method='S256'; state=$state; access_type='offline'; prompt='consent' }
  $query = ($p.GetEnumerator() | ForEach-Object { [Uri]::EscapeDataString($_.Key)+'='+[Uri]::EscapeDataString([string]$_.Value) }) -join '&'
  return @{ url = 'https://accounts.google.com/o/oauth2/v2/auth?'+$query }
}
function Save-DriveRefreshToken([string]$Token) {
  Add-Type -AssemblyName System.Security
  $bytes = [Text.Encoding]::UTF8.GetBytes($Token)
  $encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $folder = Split-Path -Parent $script:DriveTokenPath
  [IO.Directory]::CreateDirectory($folder) | Out-Null
  [IO.File]::WriteAllBytes($script:DriveTokenPath,$encrypted)
}
function Read-DriveRefreshToken {
  if (-not (Test-Path -LiteralPath $script:DriveTokenPath -PathType Leaf)) { return $null }
  Add-Type -AssemblyName System.Security
  $encrypted = [IO.File]::ReadAllBytes($script:DriveTokenPath)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  return [Text.Encoding]::UTF8.GetString($plain)
}
function Read-DriveClientSecret {
  if (Test-Path -LiteralPath $script:DriveClientProtectedPath -PathType Leaf) {
    Add-Type -AssemblyName System.Security
    $encrypted = [IO.File]::ReadAllBytes($script:DriveClientProtectedPath)
    $bytes = [Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    return [Text.Encoding]::UTF8.GetString($bytes)
  }
  if (-not (Test-Path -LiteralPath $script:DriveClientPath -PathType Leaf)) { throw 'Google OAuth client configuration is missing.' }
  $config = Get-Content -LiteralPath $script:DriveClientPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($config.installed.client_id -cne $script:DriveClientId -or -not $config.installed.client_secret) { throw 'Google OAuth client configuration does not match.' }
  return [string]$config.installed.client_secret
}
function Save-DriveClientConfig([string]$Json) {
  $config = $Json | ConvertFrom-Json
  $installed = $config.installed
  if (-not $installed -or $installed.client_id -cne $script:DriveClientId -or -not $installed.client_secret) {
    throw 'The file is not the EchoLab Windows OAuth client.'
  }
  $secret = [string]$installed.client_secret
  if ($secret.Length -gt 512 -or $secret -match '\s') { throw 'Invalid OAuth client configuration.' }
  Add-Type -AssemblyName System.Security
  $encrypted = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($secret),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $folder = Split-Path -Parent $script:DriveClientProtectedPath
  [IO.Directory]::CreateDirectory($folder) | Out-Null
  $tempPath = Join-Path $folder ('google-oauth-' + [Guid]::NewGuid().ToString('N') + '.tmp')
  $backupPath = $tempPath + '.bak'
  try {
    [IO.File]::WriteAllBytes($tempPath,$encrypted)
    if (Test-Path -LiteralPath $script:DriveClientProtectedPath -PathType Leaf) {
      [IO.File]::Replace($tempPath,$script:DriveClientProtectedPath,$backupPath)
    } else {
      [IO.File]::Move($tempPath,$script:DriveClientProtectedPath)
    }
  } finally {
    if (Test-Path -LiteralPath $tempPath) { Remove-Item -LiteralPath $tempPath -Force }
    if (Test-Path -LiteralPath $backupPath) { Remove-Item -LiteralPath $backupPath -Force }
  }
}
function Invoke-DriveToken([hashtable]$Body) {
  $Body.client_secret = Read-DriveClientSecret
  $Body.client_id = $script:DriveClientId
  return Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -Body $Body -TimeoutSec 30
}
function Complete-DriveAuthorization([string]$State,[string]$Code) {
  $session = $script:DriveSession
  $script:DriveSession = $null
  if (-not $session -or !$State -or !$Code -or $State -cne $session.State -or ([DateTime]::UtcNow - $session.Created).TotalMinutes -gt 10) { throw 'Invalid or expired authorization session.' }
  $token = Invoke-DriveToken @{ code=$Code; code_verifier=$session.Verifier; redirect_uri=$session.Redirect; grant_type='authorization_code' }
  if (-not $token.access_token -or -not $token.refresh_token) { throw 'Google did not return a refresh token.' }
  Save-DriveRefreshToken ([string]$token.refresh_token)
  $script:DriveAccess = [string]$token.access_token
  $script:DriveExpires = [DateTime]::UtcNow.AddSeconds([Math]::Max(0,[int]$token.expires_in-90))
}
function Get-DriveAccessToken {
  if ($script:DriveAccess -and [DateTime]::UtcNow -lt $script:DriveExpires) { return $script:DriveAccess }
  $refresh = Read-DriveRefreshToken
  if (-not $refresh) { return $null }
  $token = Invoke-DriveToken @{ refresh_token=$refresh; grant_type='refresh_token' }
  if (-not $token.access_token) { throw 'Google did not return an access token.' }
  $script:DriveAccess = [string]$token.access_token
  $script:DriveExpires = [DateTime]::UtcNow.AddSeconds([Math]::Max(0,[int]$token.expires_in-90))
  return $script:DriveAccess
}
function Disconnect-Drive {
  $script:DriveSession=$null; $script:DriveAccess=$null; $script:DriveExpires=[DateTime]::MinValue
  if (Test-Path -LiteralPath $script:DriveTokenPath -PathType Leaf) { Remove-Item -LiteralPath $script:DriveTokenPath -Force }
}
