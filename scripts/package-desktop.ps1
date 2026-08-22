$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pnpm = Join-Path $env:APPDATA "npm\pnpm.cmd"
$desktopDir = Join-Path $root "apps\desktop"
$webDownloadsDir = Join-Path $root "apps\web\public\downloads"
$desktopBuildDir = Join-Path $desktopDir "build"
$audioPublishDir = Join-Path $root "apps\audio-helper\bin\publish\win-x64"
$appUrl = $env:APP_URL

if (-not $appUrl) {
  $envPath = Join-Path $root ".env"

  if (Test-Path $envPath) {
    $appUrlLine = Get-Content -Path $envPath |
      Where-Object { $_ -match '^APP_URL=' } |
      Select-Object -First 1

    if ($appUrlLine) {
      $appUrl = $appUrlLine -replace '^APP_URL=', ''
    }
  }
}

if (-not $appUrl) {
  throw "APP_URL nao encontrado. Defina APP_URL no .env ou na variavel de ambiente."
}

New-Item -ItemType Directory -Force -Path $desktopBuildDir | Out-Null
Set-Content -Path (Join-Path $desktopBuildDir "app-url.txt") -Value $appUrl -Encoding UTF8

dotnet publish (Join-Path $root "apps\audio-helper\ToVeno.AudioHelper.csproj") `
  -c Release `
  -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -o $audioPublishDir `
  --nologo

& $pnpm --filter "@discord-screen/desktop" package:win

New-Item -ItemType Directory -Force -Path $webDownloadsDir | Out-Null
$installer = Get-ChildItem -Path (Join-Path $desktopDir "release") -Filter "ToVeno-Setup-*.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw "Instalador nao encontrado em apps\desktop\release."
}

Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $webDownloadsDir "ToVeno-Setup.exe") -Force
Write-Host "Instalador publicado em apps\web\public\downloads\ToVeno-Setup.exe"
