# ============================================================
#  ARIA — Bridge Health Monitoring & Predictive Maintenance
#  RUN SCRIPT — Windows PowerShell
#  Usage: Right-click → "Run with PowerShell"
#         OR in terminal: .\RUN.ps1
# ============================================================

# Colours
function OK    { param($msg) Write-Host "  [OK]   $msg" -ForegroundColor Green  }
function FAIL  { param($msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red    }
function INFO  { param($msg) Write-Host "  $msg"        -ForegroundColor Cyan   }
function WARN  { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function HEAD  { param($msg) Write-Host $msg            -ForegroundColor Cyan   }

Clear-Host
HEAD "============================================"
HEAD "   ARIA Bridge Health Monitor — Launcher   "
HEAD "============================================"
Write-Host ""

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$webApp     = Join-Path $scriptDir "index.html"
$buildFile  = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\build\index.js"
$mcpJson    = "$env:USERPROFILE\.bob\settings\mcp.json"
$modesYaml  = "$env:USERPROFILE\.bob\settings\custom_modes.yaml"

# ────────────────────────────────────────────────────────────
# PRE-FLIGHT CHECKS
# ────────────────────────────────────────────────────────────
HEAD "[ CHECK ] Running pre-flight checks..."
Write-Host ""

$ready = $true

# 1. Node.js
$nodeVer = node --version 2>$null
if ($nodeVer) { OK "Node.js $nodeVer" }
else {
    FAIL "Node.js not found — run INSTALL.ps1 first"
    $ready = $false
}

# 2. MCP server build
if (Test-Path $buildFile) { OK "MCP server build found" }
else {
    FAIL "MCP server not built — run INSTALL.ps1 first"
    $ready = $false
}

# 3. Bob config files
if (Test-Path $mcpJson)   { OK "mcp.json found" }
else { WARN "mcp.json missing — IBM Bob integration may not work (run INSTALL.ps1)" }

if (Test-Path $modesYaml) { OK "custom_modes.yaml found" }
else { WARN "custom_modes.yaml missing — Bridge Health Monitor mode unavailable (run INSTALL.ps1)" }

# 4. Web app
if (Test-Path $webApp)    { OK "Web app (index.html) found" }
else {
    FAIL "index.html not found at: $webApp"
    $ready = $false
}

Write-Host ""

if (-not $ready) {
    HEAD "============================================"
    FAIL "Cannot start — fix the errors above first."
    Write-Host ""
    INFO "Run INSTALL.ps1 to set up everything automatically."
    HEAD "============================================"
    Read-Host "  Press Enter to exit"
    exit 1
}

# ────────────────────────────────────────────────────────────
# MENU — Choose what to start
# ────────────────────────────────────────────────────────────
HEAD "============================================"
HEAD "   What would you like to start?           "
HEAD "============================================"
Write-Host ""
Write-Host "  [1]  Open web app in browser only" -ForegroundColor White
Write-Host "  [2]  Open web app + serve on network (http://localhost:3000)" -ForegroundColor White
Write-Host "  [3]  Test MCP server connection" -ForegroundColor White
Write-Host "  [4]  Run all (web app + MCP test + Bob info)" -ForegroundColor White
Write-Host ""

$choice = Read-Host "  Enter choice (1-4) or press Enter for default [1]"
if (-not $choice) { $choice = "1" }

Write-Host ""

# ────────────────────────────────────────────────────────────
# OPTION 1 — Open web app in browser
# ────────────────────────────────────────────────────────────
if ($choice -eq "1" -or $choice -eq "4") {
    HEAD "[ WEB APP ] Opening in browser..."
    Start-Process $webApp
    OK "Web app launched: $webApp"
    Write-Host ""
}

# ────────────────────────────────────────────────────────────
# OPTION 2 — Serve on local network
# ────────────────────────────────────────────────────────────
if ($choice -eq "2") {
    HEAD "[ NETWORK ] Starting local web server on port 3000..."
    Write-Host ""

    $serveExists = Get-Command serve -ErrorAction SilentlyContinue
    if (-not $serveExists) {
        INFO "Installing 'serve' package (one-time)..."
        npm install -g serve --silent
    }

    INFO "Server starting at: http://localhost:3000"
    INFO "Other devices on your network can also access this URL."
    INFO "Press Ctrl+C to stop the server."
    Write-Host ""

    Start-Process "http://localhost:3000"
    serve $scriptDir --listen 3000
    exit 0
}

# ────────────────────────────────────────────────────────────
# OPTION 3 or 4 — Test MCP server
# ────────────────────────────────────────────────────────────
if ($choice -eq "3" -or $choice -eq "4") {
    HEAD "[ MCP TEST ] Testing bridge-health MCP server..."
    Write-Host ""

    $testPayload = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

    try {
        $result = $testPayload | node $buildFile 2>$null
        $json = $result | ConvertFrom-Json -ErrorAction Stop

        $toolNames = $json.result.tools | ForEach-Object { $_.name }
        OK "MCP server responded with $($toolNames.Count) tools:"
        foreach ($t in $toolNames) {
            Write-Host "        - $t" -ForegroundColor DarkCyan
        }
    }
    catch {
        WARN "MCP server test failed — server may still work via IBM Bob."
        INFO "To test manually: node `"$buildFile`""
    }

    Write-Host ""
}

# ────────────────────────────────────────────────────────────
# BOB INTEGRATION REMINDER
# ────────────────────────────────────────────────────────────
if ($choice -eq "1" -or $choice -eq "4") {
    HEAD "[ IBM BOB ] How to use ARIA in Bob:"
    Write-Host ""
    INFO "1. Open IBM Bob"
    INFO "2. Click the mode picker"
    INFO "3. Select: Bridge Health Monitor"
    INFO "4. Type any of these commands:"
    Write-Host ""
    Write-Host "        list all bridges"                                             -ForegroundColor DarkCyan
    Write-Host "        get sensor readings for BRG-001"                             -ForegroundColor DarkCyan
    Write-Host "        analyse all sensor data for BRG-001"                         -ForegroundColor DarkCyan
    Write-Host "        what is the corrosion risk?"                                 -ForegroundColor DarkCyan
    Write-Host "        run predictive model for deck"                               -ForegroundColor DarkCyan
    Write-Host "        generate a full condition report"                            -ForegroundColor DarkCyan
    Write-Host "        what are the top 3 maintenance priorities?"                  -ForegroundColor DarkCyan
    Write-Host ""
}

# ────────────────────────────────────────────────────────────
# DONE
# ────────────────────────────────────────────────────────────
HEAD "============================================"
OK  "ARIA is running. Enjoy!"
HEAD "============================================"
Write-Host ""

Read-Host "  Press Enter to exit"
