$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  node --version
  npm --version
  npm test
  npm run typecheck
  Write-Host "Windows application checks passed."
} finally {
  Pop-Location
}
