$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'google-drive.ps1')
$folder=Join-Path ([IO.Path]::GetTempPath()) ('echolab-oauth-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($folder) | Out-Null
try {
 $script:DriveClientPath=Join-Path $folder 'client.json'; $script:DriveClientProtectedPath=Join-Path $folder 'client.dat'; $script:DriveTokenPath=Join-Path $folder 'token.dat'
 @{installed=@{client_id=$script:DriveClientId;client_secret='test-placeholder'}} | ConvertTo-Json | Set-Content -LiteralPath $script:DriveClientPath -Encoding UTF8
 $valid=@{installed=@{client_id=$script:DriveClientId;client_secret='new-test-secret'}} | ConvertTo-Json -Compress
 Save-DriveClientConfig $valid
 if ((Read-DriveClientSecret) -ne 'new-test-secret') { throw 'Client config roundtrip failed' }
 if ([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($script:DriveClientProtectedPath)).Contains('new-test-secret')) { throw 'Client secret stored as plaintext' }
 $bad=@{installed=@{client_id='wrong-client';client_secret='bad-secret'}} | ConvertTo-Json -Compress
 $invalidRejected=$false; try { Save-DriveClientConfig $bad } catch { $invalidRejected=$true }
 if (-not $invalidRejected -or (Read-DriveClientSecret) -ne 'new-test-secret') { throw 'Wrong client configuration was accepted' }
 $start=New-DriveAuthorization 18877
 if(-not $start.url.StartsWith('https://accounts.google.com/o/oauth2/v2/auth?')){throw 'Bad authorization endpoint'}
 if($start.url -notmatch 'code_challenge_method=S256' -or $start.url -notmatch 'drive.appdata'){throw 'Bad PKCE or scope'}
 $first=$script:DriveSession.State
 $null=New-DriveAuthorization 18877
 if($first -eq $script:DriveSession.State){throw 'State repeated'}
 $rejected=$false; try { Complete-DriveAuthorization 'wrong-state' 'fake-code' } catch { $rejected=$true }; if(-not $rejected){throw 'Invalid state accepted'}
 Save-DriveRefreshToken 'test-only-token'; if ((Read-DriveRefreshToken) -ne 'test-only-token') { throw 'Token roundtrip failed' }
 $raw=[IO.File]::ReadAllBytes($script:DriveTokenPath); if([Text.Encoding]::UTF8.GetString($raw).Contains('test-only-token')){throw 'Token stored as plaintext'}
 Disconnect-Drive; if(Test-Path $script:DriveTokenPath){throw 'Disconnect failed'}
 'OAuth PKCE, scope, state validation and encrypted token storage verified'
} finally { Remove-Item -LiteralPath $folder -Recurse -Force }
