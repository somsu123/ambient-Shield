# build-extension.ps1
# Builds the Next.js app as a static export, renames _next → next_assets,
# extracts inline scripts to external JS files (to comply with MV3 CSP),
# injects a route-fix script to prevent Next.js 404 client-side exceptions,
# and copies everything into extension/.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$distDir = Join-Path $root "dist"
$extDir = Join-Path $root "extension"
$manifestPath = Join-Path $extDir "manifest.json"

Write-Host ""
Write-Host "Ambient Shield — Extension Builder" -ForegroundColor Cyan
Write-Host "──────────────────────────────────────" -ForegroundColor DarkCyan

# ── Step 1: Static export ─────────────────────────────────────────────────────
Write-Host "`n[1/4] Building Next.js static export..." -ForegroundColor Yellow
Set-Location $root
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }
Write-Host "Build complete -> dist/" -ForegroundColor Green

# ── Step 2: Rename _next → next_assets inside dist/ ──────────────────────────
Write-Host "`n[2/4] Renaming _next -> next_assets (Chrome extension requirement)..." -ForegroundColor Yellow

$nextOld = Join-Path $distDir "_next"
$nextNew = Join-Path $distDir "next_assets"

if (Test-Path $nextOld) {
    if (Test-Path $nextNew) { Remove-Item $nextNew -Recurse -Force }
    Rename-Item -Path $nextOld -NewName "next_assets"
}

Write-Host "  Updating asset references..." -ForegroundColor Yellow
Get-ChildItem -Path $distDir -Recurse -Include "*.html", "*.js", "*.css", "*.txt" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw -Encoding UTF8
    if ($content -match '_next') {
        $updated = $content -replace '/_next/', '/next_assets/' -replace '"_next/', '"next_assets/' -replace "'_next/", "'next_assets/" -replace '\._next/', '.next_assets/'
        Set-Content -Path $_.FullName -Value $updated -Encoding UTF8 -NoNewline
    }
}
Write-Host "  References updated." -ForegroundColor Green

# Restore the original safe CSP without hashes
if (Test-Path $manifestPath) {
    $manifestJson = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if (-not $manifestJson.content_security_policy) {
        $manifestJson | Add-Member -MemberType NoteProperty -Name "content_security_policy" -Value @{}
    }
    $manifestJson.content_security_policy.extension_pages = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    $manifestJson | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8
}

# ── Step 3: Extract Inline Scripts & Inject Route Fix ──────────────────────────
Write-Host "`n[3/4] Extracting inline scripts and injecting Next.js router fix..." -ForegroundColor Yellow

# Create the route-fix.js file
$routeFixContent = @"
// Next.js router fix for Chrome Extensions
// Next.js expects URLs like /analyze/, not /analyze/index.html
if (window.location.pathname.endsWith('.html')) {
  var newPath = window.location.pathname.replace(/\/[^\/]+\.html$/, '/');
  if (newPath === '') newPath = '/';
  window.history.replaceState(null, '', newPath);
}
"@
$routeFixPath = Join-Path $distDir "route-fix.js"
Set-Content -Path $routeFixPath -Value $routeFixContent -Encoding UTF8 -NoNewline

Get-ChildItem -Path $distDir -Recurse -Filter "*.html" | ForEach-Object {
    $htmlPath = $_.FullName
    $htmlContent = Get-Content $htmlPath -Raw -Encoding UTF8
    
    # 1. Extract inline scripts (BUT SKIP JSON SCRIPTS like __NEXT_DATA__)
    $pattern = '(?i)<script(?![^>]*src=)(?![^>]*type=["'']application/json["''])[^>]*>(.*?)</script>'
    $matches = [regex]::Matches($htmlContent, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    
    $fileNameNoExt = [System.IO.Path]::GetFileNameWithoutExtension($htmlPath)
    $dirName = [System.IO.Path]::GetDirectoryName($htmlPath)
    
    $scriptCounter = 1
    $injectedScripts = @()
    foreach ($match in $matches) {
        $scriptContent = $match.Groups[1].Value.Trim()
        if ($scriptContent -ne "") {
            $scriptFileName = "$fileNameNoExt-inline-$scriptCounter.js"
            $scriptPath = Join-Path $dirName $scriptFileName
            Set-Content -Path $scriptPath -Value $scriptContent -Encoding UTF8 -NoNewline
            
            # Remove the original script tag from content
            $htmlContent = $htmlContent.Replace($match.Value, "")
            
            # Track the script for injection after body
            $injectedScripts += "<script src=`"./$scriptFileName`"></script>"
            $scriptCounter++
        }
    }

    # 2. Inject route-fix.js and all extracted scripts AFTER </body> to avoid React hydration issues
    $allInjected = ($injectedScripts -join "")
    $htmlContent = $htmlContent -replace '(?i)</body>', "</body>$allInjected"
    
    # Also inject route-fix.js into <head> as it's needed early
    $relDir = $dirName.Substring($distDir.Length).TrimStart('\', '/')
    $depth = if ([string]::IsNullOrEmpty($relDir)) { 0 } else { ($relDir -split '[\\/]').Count }
    $prefix = if ($depth -eq 0) { "./" } else { ("../" * $depth) }
    $routeFixTag = "<script src=`"${prefix}route-fix.js`"></script>"
    $htmlContent = $htmlContent -replace '(?i)<head>', "<head>$routeFixTag"
    
    # 3. CRITICAL: Remove 'async' from all scripts
    $htmlContent = $htmlContent -replace '(?i) async=""', "" -replace '(?i) async', ""
    
    Set-Content -Path $htmlPath -Value $htmlContent -Encoding UTF8 -NoNewline
    if ($scriptCounter -gt 1) {
        Write-Host "  Processed $($_.Name) (Extracted $($scriptCounter - 1) scripts, injected route-fix)" -ForegroundColor DarkGray
    }
}


# ── Step 4: Copy dist/ → extension/ (skip extension-specific files) ───────────
Write-Host "`n[4/4] Copying dist/ -> extension/..." -ForegroundColor Yellow

$staleNext = Join-Path $extDir "_next"
$staleNextAssets = Join-Path $extDir "next_assets"
if (Test-Path $staleNext) { Remove-Item $staleNext       -Recurse -Force }
if (Test-Path $staleNextAssets) { Remove-Item $staleNextAssets -Recurse -Force }

$preserve = @(
    "manifest.json", "background.js", "content.js", "content.css",
    "content-firewall.js", "content-firewall.css", "block-rules.json",
    "dashboard.html", "dashboard.js", "blocked.html", "parental-lock.html", "parental-lock.js",
    "messages.js", "logger.js", "heuristics.js",
    "popup.html", "popup.js", "generate-icons.html",
    "icon16.svg", "icon48.svg", "icon128.svg"
)

Get-ChildItem -Path $distDir -Recurse | ForEach-Object {
    $rel = $_.FullName.Substring($distDir.Length).TrimStart('\', '/')
    $dest = Join-Path $extDir $rel

    if ($_.PSIsContainer) {
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
    }
    else {
        $fileName = [System.IO.Path]::GetFileName($rel)
        $isRoot = -not ($rel -match '[/\\]')
        if ($isRoot -and ($preserve -contains $fileName)) {
            # Skip preserved files
        }
        else {
            Copy-Item -Path $_.FullName -Destination $dest -Force
        }
    }
}

Write-Host "Files copied." -ForegroundColor Green
Write-Host "`nDone! Reload the extension in Chrome." -ForegroundColor Yellow
