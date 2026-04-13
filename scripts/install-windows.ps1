param(
  [string]$Token = $env:GITHUB_PACKAGES_TOKEN,
  [string]$Version = "0.7.1",
  [string]$Workspace = (Get-Location).Path,
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatorio ausente: $Name"
  }
}

Require-Command node
Require-Command npm

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "Defina GITHUB_PACKAGES_TOKEN antes de instalar. Exemplo: `$env:GITHUB_PACKAGES_TOKEN='seu_token'"
}

$tempConfig = Join-Path $env:TEMP "software-factory-install-$PID.npmrc"
$packageName = "@juanblack1/software-factory-cli@$Version"

try {
  @(
    "@juanblack1:registry=https://npm.pkg.github.com"
    "//npm.pkg.github.com/:_authToken=$Token"
  ) | Set-Content -Path $tempConfig -Encoding ASCII

  Write-Host "Instalando $packageName..." -ForegroundColor Cyan
  npm install -g $packageName --userconfig $tempConfig
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao instalar $packageName"
  }

  Write-Host "Instalacao concluida." -ForegroundColor Green
  Write-Host "Workspace: $Workspace" -ForegroundColor DarkGray

  if (-not $NoLaunch) {
    Write-Host "Abrindo software-factory console..." -ForegroundColor Cyan
    & software-factory console --workspace $Workspace
  }
} finally {
  Remove-Item $tempConfig -Force -ErrorAction SilentlyContinue
}
