param(
  [string]$Token = $env:GITHUB_PACKAGES_TOKEN,
  [string]$Version = "0.7.2",
  [string]$Workspace = (Get-Location).Path,
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatorio ausente: $Name"
  }
}

function Get-InteractiveToken {
  Write-Host "GitHub Packages precisa de autenticacao." -ForegroundColor Yellow
  Write-Host "Cole um token com read:packages. Se for publicar, use write:packages tambem." -ForegroundColor DarkYellow
  $secure = Read-Host "GitHub token" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

function Get-GitHubPackagesTokenSource {
  param([string]$CurrentToken)

  if (-not [string]::IsNullOrWhiteSpace($CurrentToken)) {
    return @{ Token = $CurrentToken.Trim(); Source = "env-or-arg" }
  }

  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if ($gh) {
    try {
      $ghToken = (& gh auth token 2>$null)
      if (-not [string]::IsNullOrWhiteSpace($ghToken)) {
        return @{ Token = $ghToken.Trim(); Source = "gh" }
      }
    } catch {
    }
  }

  return @{ Token = (Get-InteractiveToken); Source = "prompt" }
}

function Install-SoftwareFactoryPackage {
  param(
    [string]$ResolvedToken,
    [string]$TempConfigPath,
    [string]$ResolvedPackageName
  )

  @(
    "@juanblack1:registry=https://npm.pkg.github.com"
    "//npm.pkg.github.com/:_authToken=$ResolvedToken"
  ) | Set-Content -Path $TempConfigPath -Encoding ASCII

  npm install -g $ResolvedPackageName --userconfig $TempConfigPath
  return $LASTEXITCODE -eq 0
}

Require-Command node
Require-Command npm

$tokenState = Get-GitHubPackagesTokenSource -CurrentToken $Token
$Token = $tokenState.Token
$tokenSource = $tokenState.Source

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "Nao foi possivel obter um token do GitHub Packages."
}

$tempConfig = Join-Path $env:TEMP "software-factory-install-$PID.npmrc"
$packageName = "@juanblack1/software-factory-cli@$Version"

try {
  Write-Host "Instalando $packageName..." -ForegroundColor Cyan
  $installed = Install-SoftwareFactoryPackage -ResolvedToken $Token -TempConfigPath $tempConfig -ResolvedPackageName $packageName
  if (-not $installed -and $tokenSource -ne "prompt") {
    Write-Host "O token automatico nao conseguiu acessar o pacote. Vou pedir um token manualmente." -ForegroundColor Yellow
    $Token = Get-InteractiveToken
    $installed = Install-SoftwareFactoryPackage -ResolvedToken $Token -TempConfigPath $tempConfig -ResolvedPackageName $packageName
  }

  if (-not $installed) {
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
