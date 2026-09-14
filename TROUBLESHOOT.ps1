# ============================================================
#  ARIA — Bridge Health Monitoring & Predictive Maintenance
#  TROUBLESHOOTER — Windows PowerShell
#  Detects problems and applies fixes automatically
#  Usage: Right-click → "Run with PowerShell"
#         OR in terminal: .\TROUBLESHOOT.ps1
# ============================================================

function OK    { param($msg) Write-Host "  [OK]    $msg" -ForegroundColor Green  }
function FIXED { param($msg) Write-Host "  [FIXED] $msg" -ForegroundColor Cyan   }
function FAIL  { param($msg) Write-Host "  [ISSUE] $msg" -ForegroundColor Red    }
function FIX   { param($msg) Write-Host "  [FIX]   $msg" -ForegroundColor Yellow }
function INFO  { param($msg) Write-Host "  [INFO]  $msg" -ForegroundColor Gray   }
function HEAD  { param($msg) Write-Host ""; Write-Host $msg -ForegroundColor Cyan }
function LINE  { Write-Host "  ────────────────────────────────────────────" -ForegroundColor DarkGray }

$issues   = 0
$fixed    = 0
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Clear-Host
Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   ARIA — Troubleshooter & Auto-Fix        " -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
INFO "Scanning your system for issues..."
Write-Host ""


# ════════════════════════════════════════════════════════════
# ISSUE 1 — NODE.JS NOT INSTALLED OR TOO OLD
# ════════════════════════════════════════════════════════════
HEAD "[ 1 ] Node.js"
LINE

$nodeVer = node --version 2>$null
if (-not $nodeVer) {
    $issues++
    FAIL "Node.js is not installed."
    FIX  "Download and install Node.js 18 LTS from: https://nodejs.org/en/download"
    FIX  "Choose the Windows Installer (.msi) — LTS version"
    FIX  "After installing, restart PowerShell, then re-run this script"
    Write-Host ""
    Write-Host "  Opening nodejs.org in your browser..." -ForegroundColor Yellow
    Start-Process "https://nodejs.org/en/download"
} else {
    $major = [int]($nodeVer -replace 'v(\d+)\..*','$1')
    if ($major -lt 18) {
        $issues++
        FAIL "Node.js $nodeVer is installed but version 18+ is required."
        FIX  "Download Node.js 18 LTS: https://nodejs.org/en/download"
        FIX  "Uninstall the old version first via Control Panel → Programs"
        FIX  "Then install the new one and restart PowerShell"
        Start-Process "https://nodejs.org/en/download"
    } else {
        OK "Node.js $nodeVer — OK"
    }
}


# ════════════════════════════════════════════════════════════
# ISSUE 2 — NPM NOT RECOGNIZED
# ════════════════════════════════════════════════════════════
HEAD "[ 2 ] npm"
LINE

$npmVer = npm --version 2>$null
if (-not $npmVer) {
    $issues++
    FAIL "npm is not recognized."
    FIX  "npm comes bundled with Node.js — if Node.js is installed, restart"
    FIX  "your PowerShell terminal and try again"
    FIX  "If still missing, reinstall Node.js from: https://nodejs.org"
} else {
    OK "npm v$npmVer — OK"
}


# ════════════════════════════════════════════════════════════
# ISSUE 3 — MCP SERVER FOLDER MISSING
# ════════════════════════════════════════════════════════════
HEAD "[ 3 ] MCP Server — Source Files"
LINE

$mcpSrc = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp"

if (-not (Test-Path "$mcpSrc\src\index.ts")) {
    $issues++
    FAIL "MCP server source not found at: $mcpSrc\src\index.ts"

    # Try to find it near the script
    $localMcp = Join-Path $scriptDir "bridge-health-mcp"
    if (Test-Path "$localMcp\src\index.ts") {
        FIX "Found bridge-health-mcp\ next to this script — copying to Bob's folder..."
        New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\mcp-servers" | Out-Null
        Copy-Item -Recurse -Force $localMcp $mcpSrc
        $fixed++
        FIXED "MCP server copied to: $mcpSrc"
    } else {
        FIX "Make sure the bridge-health-mcp\ folder is in the same directory"
        FIX "as this script, then run INSTALL.ps1"
    }
} else {
    OK "MCP server source found"
}


# ════════════════════════════════════════════════════════════
# ISSUE 4 — NPM DEPENDENCIES NOT INSTALLED (node_modules missing)
# ════════════════════════════════════════════════════════════
HEAD "[ 4 ] MCP Server — npm Dependencies"
LINE

if (Test-Path "$mcpSrc\src\index.ts") {
    if (-not (Test-Path "$mcpSrc\node_modules")) {
        $issues++
        FAIL "node_modules not found — npm install has not been run."
        FIX  "Attempting to run npm install automatically..."
        Set-Location $mcpSrc
        npm install --silent
        if ($LASTEXITCODE -eq 0) {
            $fixed++
            FIXED "npm install completed successfully"
        } else {
            FAIL "npm install failed — check your internet connection and try again"
            FIX  "Run manually: cd `"$mcpSrc`" && npm install"
        }
    } else {
        OK "node_modules present"
    }
} else {
    INFO "Skipping — MCP source not found (see Issue 3)"
}


# ════════════════════════════════════════════════════════════
# ISSUE 5 — MCP SERVER NOT BUILT (build/index.js missing)
# ════════════════════════════════════════════════════════════
HEAD "[ 5 ] MCP Server — Build Output"
LINE

$buildFile = "$mcpSrc\build\index.js"

if (Test-Path "$mcpSrc\src\index.ts") {
    if (-not (Test-Path $buildFile)) {
        $issues++
        FAIL "build\index.js not found — TypeScript has not been compiled."
        FIX  "Attempting to run npm run build automatically..."
        Set-Location $mcpSrc
        npm run build 2>&1 | Out-Null
        if (Test-Path $buildFile) {
            $fixed++
            FIXED "Build succeeded — build\index.js created"
        } else {
            FAIL "Build failed. Common causes:"
            FIX  "  → Node.js version too old (need v18+)"
            FIX  "  → node_modules missing (run: npm install first)"
            FIX  "  → TypeScript errors in src\index.ts"
            FIX  "Run manually: cd `"$mcpSrc`" && npm run build"
        }
    } else {
        OK "build\index.js present"
    }
} else {
    INFO "Skipping — MCP source not found (see Issue 3)"
}


# ════════════════════════════════════════════════════════════
# ISSUE 6 — MCP.JSON MISSING OR HAS WRONG PATH
# ════════════════════════════════════════════════════════════
HEAD "[ 6 ] Bob Config — mcp.json"
LINE

$mcpJsonPath = "$env:USERPROFILE\.bob\settings\mcp.json"

if (-not (Test-Path $mcpJsonPath)) {
    $issues++
    FAIL "mcp.json not found at: $mcpJsonPath"
    FIX  "Creating mcp.json with correct path for this PC..."
    New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\settings" | Out-Null
    $mcpPath = "$buildFile" -replace '\\', '/'
    $json = "{`"mcpServers`":{`"bridge-health`":{`"command`":`"node`",`"args`":[`"$mcpPath`"]}}}"
    Set-Content -Path $mcpJsonPath -Value $json
    $fixed++
    FIXED "mcp.json created"
} else {
    # Check if path in mcp.json is correct
    try {
        $mcp = Get-Content $mcpJsonPath -Raw | ConvertFrom-Json
        $argPath = $mcp.mcpServers.'bridge-health'.args[0]

        if ($argPath -match "faalk" -and $env:USERNAME -ne "faalk") {
            $issues++
            FAIL "mcp.json has hardcoded username 'faalk' — will not work on this PC (user: $env:USERNAME)"
            FIX  "Rewriting mcp.json with correct path for this PC..."
            $correctedPath = "$buildFile" -replace '\\', '/'
            $json = "{`"mcpServers`":{`"bridge-health`":{`"command`":`"node`",`"args`":[`"$correctedPath`"]}}}"
            Set-Content -Path $mcpJsonPath -Value $json
            $fixed++
            FIXED "mcp.json updated with correct username: $env:USERNAME"
        } elseif (-not (Test-Path ($argPath -replace '/','\'))) {
            $issues++
            FAIL "mcp.json points to a path that does not exist: $argPath"
            FIX  "Rewriting mcp.json with correct build path..."
            $correctedPath = "$buildFile" -replace '\\', '/'
            $json = "{`"mcpServers`":{`"bridge-health`":{`"command`":`"node`",`"args`":[`"$correctedPath`"]}}}"
            Set-Content -Path $mcpJsonPath -Value $json
            $fixed++
            FIXED "mcp.json corrected"
        } else {
            OK "mcp.json present and path is valid"
        }
    } catch {
        $issues++
        FAIL "mcp.json exists but contains invalid JSON"
        FIX  "Rewriting mcp.json from scratch..."
        $mcpPath = "$buildFile" -replace '\\', '/'
        $json = "{`"mcpServers`":{`"bridge-health`":{`"command`":`"node`",`"args`":[`"$mcpPath`"]}}}"
        Set-Content -Path $mcpJsonPath -Value $json
        $fixed++
        FIXED "mcp.json rewritten with valid JSON"
    }
}


# ════════════════════════════════════════════════════════════
# ISSUE 7 — CUSTOM_MODES.YAML MISSING OR INVALID
# ════════════════════════════════════════════════════════════
HEAD "[ 7 ] Bob Config — custom_modes.yaml"
LINE

$modesPath = "$env:USERPROFILE\.bob\settings\custom_modes.yaml"

if (-not (Test-Path $modesPath)) {
    $issues++
    FAIL "custom_modes.yaml not found — Bridge Health Monitor mode unavailable in Bob"
    FIX  "Creating custom_modes.yaml..."
    $yaml = @'
customModes:
  - slug: bridge-monitor
    name: Bridge Health Monitor
    roleDefinition: >-
      You are ARIA (Autonomous Real-time Infrastructure Analyst), an expert AI
      assistant specialising in bridge structural health monitoring (SHM) and
      predictive maintenance. Deep knowledge of civil engineering, sensor
      technologies, signal processing, and RCM frameworks. Generate prioritised
      recommendations (CRITICAL / HIGH / MEDIUM / LOW) per AASHTO LRFD,
      Eurocode, BS 5400, ISO 13822.
    whenToUse: Use when monitoring bridge sensor data, analysing structural health, or planning bridge maintenance.
    customInstructions: >-
      Activate bridge-health-analysis skill at session start. Call MCP tools
      before forming conclusions. Flag CRITICAL and HIGH findings prominently.
    groups:
      - read
      - edit
      - execute
      - mcp
      - skill
      - todo
      - subagent
      - mode
'@
    New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\settings" | Out-Null
    Set-Content -Path $modesPath -Value $yaml
    $fixed++
    FIXED "custom_modes.yaml created — Bridge Health Monitor mode will appear in Bob"
} else {
    $yaml = Get-Content $modesPath -Raw
    if ($yaml -match "bridge-monitor") { OK "custom_modes.yaml present and contains bridge-monitor slug" }
    else {
        $issues++
        FAIL "custom_modes.yaml exists but bridge-monitor slug is missing"
        FIX  "This may be because another mode file overwrote it"
        FIX  "Run INSTALL.ps1 to restore the correct configuration"
    }
}


# ════════════════════════════════════════════════════════════
# ISSUE 8 — SKILL.MD MISSING
# ════════════════════════════════════════════════════════════
HEAD "[ 8 ] Bob Skill — bridge-health-analysis"
LINE

$skillPath = "$env:USERPROFILE\.bob\skills\bridge-health-analysis\SKILL.md"

if (-not (Test-Path $skillPath)) {
    $issues++
    FAIL "SKILL.md not found — bridge-health-analysis skill unavailable in Bob"
    FIX  "Creating SKILL.md..."
    New-Item -ItemType Directory -Force -Path (Split-Path $skillPath) | Out-Null
    $skill = @'
---
name: bridge-health-analysis
description: >-
  Use when the user wants to analyse bridge sensor data, assess structural
  health, detect anomalies, run predictive maintenance, or generate a report.
---

# Bridge Health Monitoring and Predictive Maintenance Analysis

## Step 1 - Establish Session Context
Ask: Bridge ID, data source (MCP/file/manual), analysis goal.

## Step 2 - Ingest Sensor Data
Call: get_bridge_status, get_sensor_readings, get_sensor_history.

## Step 3 - Validate Data
Check gaps >5%, outliers beyond 3 sigma, FAULT/OFFLINE sensors.

## Step 4 - Structural Assessment
4a Strain >80% limit = HIGH, >95% = CRITICAL.
4b Vibration frequency shift >5% from baseline.
4c Displacement vs L/360 and L/240 limits.
4d Corrosion < -350 mV (HIGH), < -500 mV (CRITICAL).
4e Load >120% design weight = overload flag.

## Step 5 - Anomaly Detection
Call detect_anomalies. Z-score > 3.5 = ANOMALY.

## Step 6 - Predictive RUL
Call run_predictive_model: fatigue / corrosion / settlement.

## Step 7 - Maintenance Plan
Call get_maintenance_recommendations. Table: CRITICAL/HIGH/MEDIUM/LOW.

## Step 8 - Condition Report
Output: Executive Summary, Findings, Assessment, Plan, Standards.

## Step 9 - Archive
Write to: bridge-reports/<bridge_id>_<YYYYMMDD>_condition_report.md
'@
    Set-Content -Path $skillPath -Value $skill
    $fixed++
    FIXED "SKILL.md created — skill will activate in next Bob conversation"
} else {
    OK "SKILL.md present"
}


# ════════════════════════════════════════════════════════════
# ISSUE 9 — WEB APP FILES MISSING
# ════════════════════════════════════════════════════════════
HEAD "[ 9 ] Web Application Files"
LINE

foreach ($file in @("index.html","styles.css","app.js")) {
    $path = Join-Path $scriptDir $file
    if (Test-Path $path) { OK "$file present" }
    else {
        $issues++
        FAIL "$file not found at: $path"
        FIX  "Make sure you copy the full bridge-health-app\ folder to this PC"
        FIX  "The web app requires: index.html + styles.css + app.js together"
    }
}


# ════════════════════════════════════════════════════════════
# ISSUE 10 — MCP SERVER RUNTIME TEST
# ════════════════════════════════════════════════════════════
HEAD "[ 10 ] MCP Server — Live Response Test"
LINE

if (Test-Path $buildFile) {
    try {
        $response = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node $buildFile 2>$null
        $parsed = $response | ConvertFrom-Json -ErrorAction Stop

        if ($parsed.result.tools.Count -gt 0) {
            OK "MCP server responds correctly ($($parsed.result.tools.Count) tools visible)"
        } else {
            $issues++
            FAIL "MCP server responded but returned 0 tools"
            FIX  "Delete the build folder and rebuild:"
            FIX  "  cd `"$mcpSrc`""
            FIX  "  Remove-Item -Recurse -Force .\build"
            FIX  "  npm run build"
        }
    } catch {
        $issues++
        FAIL "MCP server did not return a valid JSON response"
        FIX  "Try rebuilding from scratch:"
        FIX  "  cd `"$mcpSrc`""
        FIX  "  Remove-Item -Recurse -Force .\build, .\node_modules"
        FIX  "  npm install"
        FIX  "  npm run build"
        FIX  "Then re-run this troubleshooter"
    }
} else {
    INFO "Skipping live test — build\index.js not found (see Issue 5)"
}


# ════════════════════════════════════════════════════════════
# ISSUE 11 — BOB MCP SERVER SHOWS AS DISCONNECTED
# ════════════════════════════════════════════════════════════
HEAD "[ 11 ] Bob MCP Connection — Disconnected?"
LINE

INFO "If Bob shows 'bridge-health' as Disconnected, check these:"

$checks = @(
    @{ Condition = (Test-Path $buildFile);   OK = "build\index.js exists";                     Fail = "build\index.js missing — run: npm run build in $mcpSrc" },
    @{ Condition = (Test-Path $mcpJsonPath); OK = "mcp.json exists";                            Fail = "mcp.json missing — run INSTALL.ps1" },
    @{ Condition = ($null -ne $nodeVer);     OK = "node.exe is accessible from PowerShell";     Fail = "node not in PATH — reinstall Node.js and restart Bob" }
)

foreach ($c in $checks) {
    if ($c.Condition) { OK $c.OK } else { $issues++; FAIL $c.Fail }
}

Write-Host ""
INFO "After fixing any issues above:"
FIX  "  1. Close and reopen IBM Bob"
FIX  "  2. Check the MCP panel — bridge-health should show as Connected"
FIX  "  3. If still disconnected, check Bob's MCP logs for the exact error"


# ════════════════════════════════════════════════════════════
# ISSUE 12 — BOB MODE NOT IN PICKER
# ════════════════════════════════════════════════════════════
HEAD "[ 12 ] Bob Mode — Not appearing in mode picker?"
LINE

if (Test-Path $modesPath) {
    $yaml = Get-Content $modesPath -Raw
    $slugOk  = $yaml -match "slug: bridge-monitor"
    $nameOk  = $yaml -match "name: Bridge Health Monitor"

    if ($slugOk -and $nameOk) {
        OK "custom_modes.yaml looks correct"
        INFO "If mode still not showing:"
        FIX  "  → Reload Bob (Ctrl+Shift+P → Reload Window)"
        FIX  "  → Check for YAML syntax errors (no tabs, straight quotes only)"
        FIX  "  → Ensure file is at: $modesPath"
        FIX  "  → Slug must match regex: ^[a-zA-Z0-9-]+$ (no underscores or spaces)"
    } else {
        $issues++
        FAIL "custom_modes.yaml has a syntax issue — slug or name missing/malformed"
        FIX  "Running INSTALL.ps1 will restore it correctly"
    }
} else {
    $issues++
    FAIL "custom_modes.yaml does not exist"
    FIX  "Run INSTALL.ps1 to create it"
}


# ════════════════════════════════════════════════════════════
# ISSUE 13 — SKILL NOT AUTO-ACTIVATING IN BOB
# ════════════════════════════════════════════════════════════
HEAD "[ 13 ] Bob Skill — Not auto-activating?"
LINE

if (Test-Path $skillPath) {
    $skill = Get-Content $skillPath -Raw
    if ($skill -match "bridge-health-analysis" -and $skill -match "description:") {
        OK "SKILL.md present and has correct name + description"
        INFO "If skill still not activating:"
        FIX  "  → Start a NEW Bob conversation (skills load at task start)"
        FIX  "  → Make sure you are in Bridge Health Monitor mode"
        FIX  "  → Skill directory name must be exactly: bridge-health-analysis"
        FIX  "     (lowercase, dashes only, no underscores)"
        FIX  "  → File must be at: $skillPath"
    } else {
        $issues++
        FAIL "SKILL.md is missing name or description in frontmatter"
        FIX  "Run INSTALL.ps1 to recreate the skill file correctly"
    }
} else {
    $issues++
    FAIL "SKILL.md not found"
    FIX  "Run INSTALL.ps1 to create it"
}


# ════════════════════════════════════════════════════════════
# ISSUE 14 — WEB APP SHOWS BLANK PAGE
# ════════════════════════════════════════════════════════════
HEAD "[ 14 ] Web App — Blank page in browser?"
LINE

$webApp = Join-Path $scriptDir "index.html"
if (Test-Path $webApp) {
    OK "index.html found at: $webApp"
    INFO "If the page appears blank:"
    FIX  "  → Use Chrome 90+, Edge, or Firefox (NOT Internet Explorer)"
    FIX  "  → Move the bridge-health-app\ folder to your Desktop and reopen"
    FIX  "  → Do NOT open from a network share or ZIP archive without extracting first"
    FIX  "  → Check browser console (F12 → Console) for error messages"
    FIX  "  → Try serving locally: npm install -g serve && serve `"$scriptDir`""
} else {
    $issues++
    FAIL "index.html not found — copy the full bridge-health-app\ folder to this PC"
}


# ════════════════════════════════════════════════════════════
# ISSUE 15 — CHARTS NOT SHOWING
# ════════════════════════════════════════════════════════════
HEAD "[ 15 ] Web App — Charts not visible?"
LINE

OK "Charts use the browser's built-in Canvas API (no external library needed)"
INFO "If charts are blank or missing:"
FIX  "  → Update your browser to the latest version"
FIX  "  → Disable any browser extensions that block canvas (e.g. privacy extensions)"
FIX  "  → Open browser console (F12) and look for JavaScript errors"
FIX  "  → Try a different browser (Chrome recommended)"


# ════════════════════════════════════════════════════════════
# ISSUE 16 — PORT 3000 ALREADY IN USE
# ════════════════════════════════════════════════════════════
HEAD "[ 16 ] Network Server — Port already in use?"
LINE

$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000) {
    $issues++
    FAIL "Port 3000 is already in use by another process (PID: $($port3000[0].OwningProcess))"
    FIX  "Use a different port when running the server:"
    FIX  "  serve .\bridge-health-app --listen 4000"
    FIX  "  Then open: http://localhost:4000"
    FIX  "Or stop the existing process using port 3000"
} else {
    OK "Port 3000 is free"
}


# ════════════════════════════════════════════════════════════
# ISSUE 17 — POWERSHELL EXECUTION POLICY BLOCKING SCRIPTS
# ════════════════════════════════════════════════════════════
HEAD "[ 17 ] PowerShell — Execution Policy"
LINE

$policy = Get-ExecutionPolicy
if ($policy -eq "Restricted") {
    $issues++
    FAIL "PowerShell Execution Policy is 'Restricted' — scripts cannot run"
    FIX  "Run this command in PowerShell as Administrator:"
    FIX  "  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser"
    FIX  "Then re-run this script"
} elseif ($policy -in @("AllSigned","RemoteSigned","Unrestricted","Bypass")) {
    OK "Execution Policy is '$policy' — scripts allowed"
} else {
    INFO "Execution Policy: $policy"
}


# ════════════════════════════════════════════════════════════
# ISSUE 18 — TYPESCRIPT COMPILE ERRORS
# ════════════════════════════════════════════════════════════
HEAD "[ 18 ] TypeScript — Compile errors on npm run build?"
LINE

INFO "Common TypeScript build errors and fixes:"
Write-Host ""
Write-Host "  ERROR: Cannot find module '@modelcontextprotocol/sdk'" -ForegroundColor Red
FIX  "  Run: npm install   (node_modules may be missing or corrupted)"
Write-Host ""
Write-Host "  ERROR: Type error / strict mode failure" -ForegroundColor Red
FIX  "  Upgrade Node.js to v18+ — older versions may have type incompatibilities"
Write-Host ""
Write-Host "  ERROR: error TS2307: Cannot find module" -ForegroundColor Red
FIX  "  Delete node_modules and reinstall:"
FIX  "    cd `"$mcpSrc`""
FIX  "    Remove-Item -Recurse -Force .\node_modules"
FIX  "    npm install"
FIX  "    npm run build"
Write-Host ""
Write-Host "  ERROR: Module resolution failed" -ForegroundColor Red
FIX  "  Ensure tsconfig.json has module=Node16 and moduleResolution=Node16"


# ════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   TROUBLESHOOT SUMMARY                    " -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if ($issues -eq 0) {
    Write-Host "  No issues found." -ForegroundColor Green
    Write-Host "  ARIA is fully set up and ready to use." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Run RUN.ps1 to launch the application." -ForegroundColor Cyan
} else {
    Write-Host "  Issues detected  : $issues" -ForegroundColor Red
    Write-Host "  Auto-fixed       : $fixed"  -ForegroundColor Cyan
    Write-Host "  Needs manual fix : $($issues - $fixed)" -ForegroundColor Yellow
    Write-Host ""
    if ($fixed -gt 0) {
        Write-Host "  $fixed issue(s) were fixed automatically." -ForegroundColor Cyan
        Write-Host "  Re-run this script to confirm all issues are resolved." -ForegroundColor Cyan
    }
    if (($issues - $fixed) -gt 0) {
        Write-Host "  $($issues - $fixed) issue(s) require manual action." -ForegroundColor Yellow
        Write-Host "  Follow the [FIX] instructions shown above." -ForegroundColor Yellow
        Write-Host "  Run INSTALL.ps1 to fix most issues automatically." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "  Script order:" -ForegroundColor DarkGray
Write-Host "    INSTALL.ps1      → Set up everything (run once on new PC)" -ForegroundColor DarkGray
Write-Host "    TROUBLESHOOT.ps1 → Diagnose and auto-fix issues (run anytime)" -ForegroundColor DarkGray
Write-Host "    RUN.ps1          → Launch the application" -ForegroundColor DarkGray
Write-Host "    TEST.ps1         → Verify all components pass" -ForegroundColor DarkGray
Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Read-Host "  Press Enter to exit"
