param(
  [Parameter(Mandatory = $true)]
  [string] $Url,

  [string] $LiveKitUrl
)

$ErrorActionPreference = "Stop"

$normalizedUrl = $Url.Trim().TrimEnd("/")

if ($normalizedUrl -notmatch "^https://") {
  throw "Use a public HTTPS URL, for example: https://example.trycloudflare.com"
}

$normalizedLiveKitUrl = if ($LiveKitUrl) {
  $LiveKitUrl.Trim().TrimEnd("/")
} else {
  $normalizedUrl
}

if ($normalizedLiveKitUrl -notmatch "^https://") {
  throw "Use a public HTTPS LiveKit URL, for example: https://livekit.trycloudflare.com"
}

$publicLivekitUrl = $normalizedLiveKitUrl -replace "^https://", "wss://"
$files = @(".env", "apps/web/.env.local")

foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath $file)) {
    Write-Warning "Skipping missing file: $file"
    continue
  }

  $content = Get-Content -LiteralPath $file -Raw

  if ($content -match "(?m)^APP_URL=") {
    $content = $content -replace "(?m)^APP_URL=.*$", "APP_URL=$normalizedUrl"
  } else {
    $content = $content.TrimEnd() + "`r`nAPP_URL=$normalizedUrl`r`n"
  }

  if ($content -match "(?m)^LIVEKIT_PUBLIC_URL=") {
    $content = $content -replace "(?m)^LIVEKIT_PUBLIC_URL=.*$", "LIVEKIT_PUBLIC_URL=$publicLivekitUrl"
  } else {
    $content = $content -replace "(?m)^LIVEKIT_URL=.*$", "`$0`r`nLIVEKIT_PUBLIC_URL=$publicLivekitUrl"
  }

  Set-Content -LiteralPath $file -Value $content -NoNewline
  Write-Host "Updated $file"
}

Write-Host "APP_URL=$normalizedUrl"
Write-Host "LIVEKIT_PUBLIC_URL=$publicLivekitUrl"
