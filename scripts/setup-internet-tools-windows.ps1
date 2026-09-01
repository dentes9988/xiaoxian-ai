$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$ConfigDir = if ($env:AGENT_REACH_HOME) { $env:AGENT_REACH_HOME } else { Join-Path $HOME ".agent-reach" }
$ConfigPath = Join-Path $ConfigDir "mcporter.json"
$McporterBin = Join-Path $RootDir "node_modules\.bin\mcporter.cmd"

if (-not (Test-Path $McporterBin)) {
  npm install --prefix $RootDir
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

py -3 -m pip install --user pipx
if ($LASTEXITCODE -ne 0) { throw "pipx installation failed" }

py -3 -m pipx install agent-reach
if ($LASTEXITCODE -ne 0) {
  py -3 -m pipx upgrade agent-reach
  if ($LASTEXITCODE -ne 0) { throw "Agent Reach installation failed" }
}

New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
& $McporterBin --config $ConfigPath config add exa https://mcp.exa.ai/mcp
if ($LASTEXITCODE -ne 0) { throw "Exa configuration failed" }
& $McporterBin config add exa https://mcp.exa.ai/mcp --scope home
if ($LASTEXITCODE -ne 0) { throw "Agent Reach Exa configuration failed" }

node (Join-Path $RootDir "scripts\check-internet-tools.mjs")
if ($LASTEXITCODE -ne 0) { throw "Internet tool verification failed" }

Write-Host ""
Write-Host "Internet tools are ready."
Write-Host "Core channels: Exa web search, Jina webpage reader, and GitHub search when gh is installed."
