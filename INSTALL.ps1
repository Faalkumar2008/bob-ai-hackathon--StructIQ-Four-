# ============================================================
#  ARIA — Bridge Health Monitoring & Predictive Maintenance
#  INSTALLATION SCRIPT
#  Run this file in PowerShell on ANY Windows PC
#  Usage: Right-click → "Run with PowerShell"
#         OR in terminal: .\INSTALL.ps1
# ============================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ARIA Bridge Health Monitor — Installer  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ────────────────────────────────────────────────────────────
# STEP 1 — CHECK NODE.JS
# ────────────────────────────────────────────────────────────

Write-Host "[ 1/7 ] Checking Node.js..." -ForegroundColor Yellow

$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "  [FAIL] Node.js is not installed." -ForegroundColor Red
    Write-Host "  Please install Node.js 18 LTS from: https://nodejs.org" -ForegroundColor Red
    Write-Host "  After installing, restart PowerShell and run this script again." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

$major = [int]($nodeVersion -replace 'v(\d+)\..*','$1')
if ($major -lt 18) {
    Write-Host "  [WARN] Node.js $nodeVersion found — version 18+ recommended." -ForegroundColor Yellow
    Write-Host "  Download latest LTS from: https://nodejs.org" -ForegroundColor Yellow
} else {
    Write-Host "  [OK] Node.js $nodeVersion" -ForegroundColor Green
}

# ────────────────────────────────────────────────────────────
# STEP 2 — LOCATE THE MCP SERVER FOLDER
# ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "[ 2/7 ] Locating MCP server source..." -ForegroundColor Yellow

# Look for bridge-health-mcp relative to this script's location
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$mcpSource  = Join-Path $scriptDir "bridge-health-mcp"

# Also check one level up (in case script is inside bridge-health-app\)
if (-not (Test-Path $mcpSource)) {
    $mcpSource = Join-Path (Split-Path -Parent $scriptDir) "bridge-health-mcp"
}

if (-not (Test-Path "$mcpSource\src\index.ts")) {
    Write-Host "  [FAIL] bridge-health-mcp folder not found." -ForegroundColor Red
    Write-Host "  Make sure bridge-health-mcp\ is in the same folder as this script." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

Write-Host "  [OK] Found: $mcpSource" -ForegroundColor Green

# ────────────────────────────────────────────────────────────
# STEP 3 — COPY MCP SERVER TO BOB'S FOLDER
# ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "[ 3/7 ] Copying MCP server to Bob's folder..." -ForegroundColor Yellow

$bobMcpDest = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp"

New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\mcp-servers" | Out-Null
Copy-Item -Recurse -Force $mcpSource $bobMcpDest

Write-Host "  [OK] Copied to: $bobMcpDest" -ForegroundColor Green

# ────────────────────────────────────────────────────────────
# STEP 4 — INSTALL NPM DEPENDENCIES
# ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "[ 4/7 ] Installing npm dependencies (this may take 30 seconds)..." -ForegroundColor Yellow

Set-Location $bobMcpDest
npm install --silent

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] npm install failed. Check your internet connection." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

Write-Host "  [OK] Dependencies installed" -ForegroundColor Green

# ────────────────────────────────────────────────────────────
# STEP 5 — BUILD TYPESCRIPT → JAVASCRIPT
# ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "[ 5/7 ] Building MCP server (TypeScript → JavaScript)..." -ForegroundColor Yellow

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Build failed. Try upgrading Node.js to v18+ and run again." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

$buildFile = "$bobMcpDest\build\index.js"
if (-not (Test-Path $buildFile)) {
    Write-Host "  [FAIL] build\index.js not found after build." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

Write-Host "  [OK] Build successful: $buildFile" -ForegroundColor Green

# ────────────────────────────────────────────────────────────
# STEP 6 — WRITE BOB CONFIG FILES
# ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "[ 6/7 ] Writing IBM Bob configuration files..." -ForegroundColor Yellow

$bobSettings = "$env:USERPROFILE\.bob\settings"
New-Item -ItemType Directory -Force -Path $bobSettings | Out-Null

# --- mcp.json (auto-detects username) ---
$mcpPath = "$bobMcpDest\build\index.js" -replace '\\', '/'
$mcpJson = @"
{
  "mcpServers": {
    "bridge-health": {
      "command": "node",
      "args": ["$mcpPath"]
    }
  }
}
"@
Set-Content -Path "$bobSettings\mcp.json" -Value $mcpJson
Write-Host "  [OK] mcp.json written" -ForegroundColor Green

# --- custom_modes.yaml ---
$modesYaml = @'
customModes:
  - slug: bridge-monitor
    name: Bridge Health Monitor
    roleDefinition: >-
      You are ARIA (Autonomous Real-time Infrastructure Analyst), an expert AI
      assistant specialising in bridge structural health monitoring (SHM) and
      predictive maintenance. You have deep knowledge of civil engineering
      principles, sensor technologies (strain gauges, accelerometers, LVDT
      displacement sensors, corrosion probes, temperature sensors, and traffic
      load cells), signal processing, and reliability-centred maintenance (RCM)
      frameworks. Your responsibilities: interpret sensor data, detect anomalies,
      run predictive maintenance workflows, generate prioritised recommendations
      (CRITICAL / HIGH / MEDIUM / LOW), and produce evidence-based reports.
      Apply standards: AASHTO LRFD, Eurocode, BS 5400, ISO 13822.
    whenToUse: Use when monitoring bridge sensor data, analysing structural health, or planning bridge maintenance.
    description: AI assistant for bridge structural health monitoring, sensor data analysis, and predictive maintenance.
    customInstructions: >-
      Always activate the bridge-health-analysis skill at the start of any
      monitoring or analysis session. When sensor data is available, call the
      bridge-health MCP server tools before forming conclusions. Format outputs
      with clear section headers. Flag CRITICAL and HIGH findings prominently.
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
Set-Content -Path "$bobSettings\custom_modes.yaml" -Value $modesYaml
Write-Host "  [OK] custom_modes.yaml written" -ForegroundColor Green

# --- SKILL.md ---
$skillDir = "$env:USERPROFILE\.bob\skills\bridge-health-analysis"
New-Item -ItemType Directory -Force -Path $skillDir | Out-Null

$skillMd = @'
---
name: bridge-health-analysis
description: >-
  Use when the user wants to analyse bridge sensor data, assess structural
  health, detect anomalies or defects, run predictive maintenance analysis,
  or generate a bridge condition report.
---

# Bridge Health Monitoring and Predictive Maintenance Analysis

Follow these steps every time a bridge analysis or monitoring session is requested.

## Step 1 - Establish Session Context
Ask for: Bridge ID, data source (MCP / file / manual), analysis goal.

## Step 2 - Ingest Sensor Data
Call: get_bridge_status then get_sensor_readings then get_sensor_history for alerts.

## Step 3 - Pre-process and Validate
Check: data gaps >5%, outliers beyond 3 standard deviations, FAULT/OFFLINE sensors.

## Step 4 - Structural Assessment
4a Strain: flag if >80% design limit (HIGH) or >95% (CRITICAL).
4b Vibration: flag frequency shifts >5% from baseline.
4c Displacement: compare to L/360 live load and L/240 total load limits.
4d Corrosion: flag if half-cell potential < -350 mV (HIGH) or < -500 mV (CRITICAL).
4e Load: flag overload events >120% design vehicle weight.

## Step 5 - Anomaly Detection
Call detect_anomalies MCP tool. Z-score > 3.5 = ANOMALY.

## Step 6 - Predictive RUL
Call run_predictive_model for fatigue / corrosion / settlement models.

## Step 7 - Maintenance Recommendations
Call get_maintenance_recommendations. Present as CRITICAL / HIGH / MEDIUM / LOW table.

## Step 8 - Condition Report
Output: Executive Summary, Critical Findings, Component Assessment, Plan, Standards.

## Step 9 - Archive
Offer to write report to: bridge-reports/<bridge_id>_<YYYYMMDD>_condition_report.md
'@
Set-Content -Path "$skillDir\SKILL.md" -Value $skillMd
Write-Host "  [OK] SKILL.md written" -ForegroundColor Green

# ────────────────────────────────────────────────────────────
# STEP 7 — VERIFY ALL COMPONENTS
# ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "[ 7/7 ] Verifying installation..." -ForegroundColor Yellow

$allOk = $true

$checks = @(
    @{ Path = "$bobMcpDest\build\index.js";              Label = "MCP server build" },
    @{ Path = "$bobSettings\mcp.json";                   Label = "mcp.json" },
    @{ Path = "$bobSettings\custom_modes.yaml";          Label = "custom_modes.yaml" },
    @{ Path = "$skillDir\SKILL.md";                      Label = "SKILL.md" }
)

foreach ($check in $checks) {
    if (Test-Path $check.Path) {
        Write-Host "  [OK] $($check.Label)" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $($check.Label) — not found at $($check.Path)" -ForegroundColor Red
        $allOk = $false
    }
}

# Check web app index.html
$webApp = Join-Path $scriptDir "index.html"
if (Test-Path $webApp) {
    Write-Host "  [OK] Web app (index.html)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] index.html not found in script directory — open it manually" -ForegroundColor Yellow
}

# ────────────────────────────────────────────────────────────
# DONE
# ────────────────────────────────────────────────────────────

Write-Host ""

if ($allOk) {
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  Installation Complete!                  " -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "  1. Open the web app:" -ForegroundColor White
    Write-Host "     $webApp" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Open IBM Bob" -ForegroundColor White
    Write-Host "     Mode picker --> Bridge Health Monitor" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  3. In Bob, type:" -ForegroundColor White
    Write-Host "     list all bridges" -ForegroundColor Cyan
} else {
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "  Installation finished with errors.      " -ForegroundColor Red
    Write-Host "  Fix the [FAIL] items above and re-run.  " -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
}

Write-Host ""

# Open the web app automatically if it exists
if (Test-Path $webApp) {
    Write-Host "  Opening web app in your browser..." -ForegroundColor Yellow
    Start-Process $webApp
}

Read-Host "  Press Enter to exit"
