# install.ps1 — 把 skills/free-models 复制进各 harness 的 skills 目录（不碰任何 key 配置）
# 用法：.\install\install.ps1 [-Harnesses opencode,claude,codex|all]
param([string]$Harnesses = "all")
$ErrorActionPreference = "Stop"
$src = Join-Path $PSScriptRoot "..\skills\free-models"
if (-not (Test-Path (Join-Path $src "SKILL.md"))) { throw "找不到 $src\SKILL.md（应在本仓库内运行）" }
$list = if ($Harnesses -eq "all") { @("opencode", "claude", "codex") } else { ($Harnesses -replace '\s+', ',').Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ } }
foreach ($id in $list) {
  $dir = switch ($id) {
    "opencode" { Join-Path $env:USERPROFILE ".config\opencode\skills\free-models" }
    "claude"   { Join-Path $env:USERPROFILE ".claude\skills\free-models" }
    "codex"    { Join-Path $env:USERPROFILE ".codex\prompts\free-models" }
    default    { throw "未知 harness：$id（可选 opencode / claude / codex）" }
  }
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item (Join-Path $src "SKILL.md") -Destination (Join-Path $dir "SKILL.md") -Force
  if ($id -eq "codex") { Write-Host "✅ codex → $dir（Codex 无原生 skills；已放 prompts，可在会话中引用）" }
  else { Write-Host "✅ $id → $dir" }
}
Write-Host "`n后续：重启对应 harness 会话即生效；卸载 = 直接删除上述目录。"
