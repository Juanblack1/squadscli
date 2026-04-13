param(
  [string]$Version = "0.9.0",
  [string]$OutputDir = (Join-Path (Get-Location) "release-assets")
)

$ErrorActionPreference = "Stop"

Import-Module ps2exe -ErrorAction Stop

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installScript = Join-Path $scriptDir "install-windows.ps1"

if (-not (Test-Path $installScript)) {
  throw "Arquivo nao encontrado: $installScript"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$targetExe = Join-Path $OutputDir "software-factory-installer-$Version.exe"

Invoke-ps2exe `
  -inputFile $installScript `
  -outputFile $targetExe `
  -title "software-factory installer" `
  -description "Instala o software-factory CLI e abre o console" `
  -product "software-factory" `
  -company "Juanblack1" `
  -version $Version `
  -noConsole:$false

if (-not (Test-Path $targetExe)) {
  throw "Instalador nao foi gerado em $targetExe"
}

Write-Host $targetExe
