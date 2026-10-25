# install.ps1 — 把 free-llm-tokens 的完整运行时（SKILL.md + scripts/ + registry/ + docs/）装进各 Agent 的 skills 目录
# 用法：.\install\install.ps1 [-Harnesses agents,opencode,claude,codex|all]
param([string]$Harnesses = "all")
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$skillMd = Join-Path $repo "skills\free-llm-tokens\SKILL.md"
if (-not (Test-Path $skillMd)) { throw "找不到 $skillMd（应在本仓库内运行）" }
$payload = @("scripts", "registry", "docs")
$list = if ($Harnesses -eq "all") { @("agents", "opencode", "claude", "codex", "hermes") } else { ($Harnesses -replace '\s+', ',').Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ } }
# Hermes 的 home 解析顺序：$HERMES_HOME → Windows %LOCALAPPDATA%\hermes → ~/.hermes
function Get-HermesHome {
  if ($env:HERMES_HOME) { return $env:HERMES_HOME }
  $win = Join-Path $env:LOCALAPPDATA 'hermes'
  if ($env:LOCALAPPDATA -and (Test-Path (Join-Path $win 'config.yaml'))) { return $win }
  if ($env:LOCALAPPDATA -and (Test-Path (Join-Path $win 'skills'))) { return $win }
  return (Join-Path $env:USERPROFILE '.hermes')
}
foreach ($id in $list) {
  $dir = switch ($id) {
    # AgentSkills 通用标准目录：Claude Code / OpenCode / Codex 等多家 harness 都可识别
    "agents"   { Join-Path $env:USERPROFILE ".agents\skills\free-llm-tokens" }
    "opencode" { Join-Path $env:USERPROFILE ".config\opencode\skills\free-llm-tokens" }
    "claude"   { Join-Path $env:USERPROFILE ".claude\skills\free-llm-tokens" }
    "codex"    { Join-Path $env:USERPROFILE ".codex\prompts\free-llm-tokens" }
    "hermes"   { Join-Path (Get-HermesHome) "skills\free-llm-tokens" }
    default    { throw "未知目标：$id（可选 agents / opencode / claude / codex / hermes）" }
  }
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  # 先清掉旧 payload，避免残留过期脚本
  foreach ($sub in $payload) {
    $p = Join-Path $dir $sub
    if (Test-Path $p) { Remove-Item $p -Recurse -Force }
  }
  Copy-Item $skillMd -Destination (Join-Path $dir "SKILL.md") -Force
  foreach ($sub in $payload) { Copy-Item (Join-Path $repo $sub) -Destination $dir -Recurse -Force }
  # 安装完整性自检：缺运行时就是坏安装，直接报错而不是装完才发现
  foreach ($f in @("scripts\refresh.js", "scripts\lib\registry.js", "registry\sources.json", "registry\rules.json")) {
    if (-not (Test-Path (Join-Path $dir $f))) { throw "$id 安装不完整：缺少 $f" }
  }
  if ($id -eq "codex") { Write-Host "✅ codex → $dir（含 scripts/ registry/；Codex 无原生 skills，已放 prompts）" }
  else { Write-Host "✅ $id → $dir（SKILL.md + scripts/ + registry/ + docs/）" }
}
$hint = Join-Path $env:USERPROFILE ".agents\skills\free-llm-tokens\scripts\status.js"
Write-Host "`n自检：node `"$hint`""
Write-Host "重启对应 harness 会话即生效；卸载 = 直接删除上述目录。"
