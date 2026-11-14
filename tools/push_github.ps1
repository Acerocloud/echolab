#!/usr/bin/env pwsh
<#
  把 EchoLab 通过 GitHub REST API 上传（不需要 git，也不需要网页登录）

  用法:
    $env:GITHUB_TOKEN = "ghp_xxx"
    pwsh -File tools/push_github.ps1 -Repo echolab

  需要 token 权限:
    classic token  -> 勾选 repo
    fine-grained   -> Contents: Read and write + Administration: Read and write
#>

param(
  [string]$Token = $env:GITHUB_TOKEN,
  [string]$Repo = "echolab",
  [string]$Description = "逐句影子跟读练习器：YouTube 嵌入 + 双语字幕 + 录音对比 + AI 造句",
  [string]$Branch = "main",
  [switch]$Private
)

$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

if (-not $Token) { throw "缺少 token。设置 `$env:GITHUB_TOKEN 或传 -Token。" }

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$API = "https://api.github.com"
$Headers = @{
  Authorization          = "token $Token"
  "User-Agent"           = "EchoLab-Uploader"
  Accept                 = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

function Api {
  param([string]$Method, [string]$Path, $Body)
  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 20 -Compress } else { $null }
  if ($json) {
    return Invoke-RestMethod -Uri "$API$Path" -Method $Method -Headers $Headers `
      -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -ContentType "application/json; charset=utf-8"
  }
  return Invoke-RestMethod -Uri "$API$Path" -Method $Method -Headers $Headers
}

# ---------------------------------------------------------------- 1. 身份
Write-Host "==> 校验 token" -ForegroundColor Cyan
$me = Api GET "/user"
$owner = $me.login
Write-Host "    登录为 $owner"

# ---------------------------------------------------------------- 2. 建仓库
Write-Host "==> 创建仓库 $owner/$Repo" -ForegroundColor Cyan
try {
  $r = Api POST "/user/repos" @{
    name        = $Repo
    description = $Description
    private     = [bool]$Private
    has_issues  = $true
    has_wiki    = $false
    auto_init   = $false
  }
  Write-Host "    已创建：$($r.html_url)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 422) { Write-Host "    仓库已存在，继续覆盖推送" }
  else { throw }
}

# ---------------------------------------------------------------- 3. 收集文件
Write-Host "==> 收集文件" -ForegroundColor Cyan
$skipDirs = @(".git", "node_modules", ".cache", "bin", "dist")
$files = Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object {
  $rel = $_.FullName.Substring($Root.Length).TrimStart('\', '/')
  $parts = $rel -split '[\\/]'
  -not ($parts | Where-Object { $skipDirs -contains $_ }) -and
  $_.Name -notmatch '\.(log|tmp)$' -and
  $_.FullName -notmatch '\\\.git\\'
}
Write-Host "    $($files.Count) 个文件"

# ---------------------------------------------------------------- 4. 上传 blob
$tree = New-Object System.Collections.ArrayList
$i = 0
foreach ($f in $files) {
  $i++
  $rel = $f.FullName.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/')
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
  $blob = Api POST "/repos/$owner/$Repo/git/blobs" @{ content = $b64; encoding = "base64" }
  [void]$tree.Add(@{ path = $rel; mode = "100644"; type = "blob"; sha = $blob.sha })
  if ($i % 10 -eq 0 -or $i -eq $files.Count) {
    Write-Host "    $i/$($files.Count)  $rel"
  }
}

# ---------------------------------------------------------------- 5. 提交
Write-Host "==> 创建 tree / commit" -ForegroundColor Cyan
$newTree = Api POST "/repos/$owner/$Repo/git/trees" @{ tree = $tree.ToArray() }
$msg = "EchoLab v0.8`n`n逐句影子跟读练习器：YouTube 嵌入播放 + 双语字幕 + 跟读录音`n+ 离线词典与重点词注解 + AI 造句生词本 + 可自定义快捷键"
$commit = Api POST "/repos/$owner/$Repo/git/commits" @{
  message = $msg
  tree    = $newTree.sha
  parents = @()
}

# ---------------------------------------------------------------- 6. 建分支
Write-Host "==> 指向 $Branch" -ForegroundColor Cyan
try {
  Api POST "/repos/$owner/$Repo/git/refs" @{ ref = "refs/heads/$Branch"; sha = $commit.sha } | Out-Null
} catch {
  # 分支已存在则强制更新
  Api PATCH "/repos/$owner/$Repo/git/refs/heads/$Branch" @{ sha = $commit.sha; force = $true } | Out-Null
}

try {
  Api PATCH "/repos/$owner/$Repo" @{ default_branch = $Branch } | Out-Null
} catch {}

Write-Host ""
Write-Host "完成：https://github.com/$owner/$Repo" -ForegroundColor Green
