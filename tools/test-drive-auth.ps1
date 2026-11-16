$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'google-drive.ps1')
$folder=Join-Path ([IO.Path]::GetTempPath()) ('echolab-oauth-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($folder) | Out-Null
try {
 $script:DriveTokenPath=Join-Path $folder 'token.dat'
 $script:DriveClientPath=Join-Path $folder 'client.json'
 $script:DriveClientProtectedPath=Join-Path $folder 'client.dat'
 $fixtureSecret='test-only-client-secret'
 @{installed=@{client_id=$script:DriveClientId;client_secret=$fixtureSecret}} | ConvertTo-Json | Set-Content -LiteralPath $script:DriveClientPath -Encoding UTF8
 $start=New-DriveAuthorization 18877
 if(-not $start.url.StartsWith('https://accounts.google.com/o/oauth2/v2/auth?')){throw 'Bad authorization endpoint'}
 if($start.url -notmatch 'code_challenge_method=S256' -or $start.url -notmatch 'drive.appdata'){throw 'Bad PKCE or scope'}
 if($start.url.Contains($fixtureSecret)){throw 'Client secret included in authorization URL'}
 $first=$script:DriveSession.State
 $null=New-DriveAuthorization 18877
 if($first -eq $script:DriveSession.State){throw 'State repeated'}
 $rejected=$false; try { Complete-DriveAuthorization 'wrong-state' 'fake-code' } catch { $rejected=$true }; if(-not $rejected){throw 'Invalid state accepted'}
 Save-DriveRefreshToken 'test-only-token'; if ((Read-DriveRefreshToken) -ne 'test-only-token') { throw 'Token roundtrip failed' }
 $raw=[IO.File]::ReadAllBytes($script:DriveTokenPath); if([Text.Encoding]::UTF8.GetString($raw).Contains('test-only-token')){throw 'Token stored as plaintext'}
 Disconnect-Drive; if(Test-Path $script:DriveTokenPath){throw 'Disconnect failed'}
 'OAuth PKCE, scope, state validation and encrypted token storage verified'
} finally { Remove-Item -LiteralPath $folder -Recurse -Force }
