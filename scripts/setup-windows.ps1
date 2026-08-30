$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  $nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
  if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Installed major version: $nodeMajor"
  }

  npm install
  New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot "data") | Out-Null

  Write-Host ""
  Write-Host "xiaoxian AI dependencies are installed."
  Write-Host "Next: npm run check:windows"
  Write-Host "Then: npm run dev"
} finally {
  Pop-Location
}
