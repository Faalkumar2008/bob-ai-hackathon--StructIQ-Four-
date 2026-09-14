# ============================================================
#  ARIA — Bridge Health Monitoring & Predictive Maintenance
#  PORTABLE SETUP FILE — Works on ANY Windows / Mac / Linux PC
#  Platform : IBM Bob AI + MCP Server + Web Dashboard
# ============================================================

# ────────────────────────────────────────────────────────────
# WHAT YOU NEED TO COPY TO THE NEW PC
# ────────────────────────────────────────────────────────────
#
#  Copy this entire folder to the new machine:
#
#    bridge-health-app\          ← Web application (copy anywhere, e.g. Desktop)
#    ├── index.html
#    ├── styles.css
#    ├── app.js
#    ├── README.md
#    ├── SETUP.md                ← This file
#    └── ARIA_Bridge_Health_Presentation.pptx
#
#  Copy this MCP server folder:
#
#    bridge-health-mcp\          ← MCP server source (copy anywhere)
#    ├── src\index.ts
#    ├── package.json
#    └── tsconfig.json
#
#  ✅  Do NOT copy node_modules\ or build\ — those are rebuilt on the new PC.
#  ✅  Do NOT copy .bob\settings\ files directly — run the setup steps below instead.
#  ✅  The web app (index.html) works on ANY PC with ZERO setup — just open it.


# ────────────────────────────────────────────────────────────
# SECTION 1 — PREREQUISITES (install on the new PC)
# ────────────────────────────────────────────────────────────
#
#  ┌─────────────────────┬──────────┬────────────────────────────────────────────────┐
#  │ Tool                │ Version  │ How to get it                                  │
#  ├─────────────────────┼──────────┼────────────────────────────────────────────────┤
#  │ Modern Browser      │ Any      │ Chrome / Edge / Firefox — already on most PCs  │
#  │ Node.js             │ 18 LTS+  │ https://nodejs.org  → Download LTS             │
#  │ IBM Bob             │ Latest   │ Install IBM Bob on the new PC                  │
#  │ Git (optional)      │ Any      │ https://git-scm.com  (only if cloning)         │
#  └─────────────────────┴──────────┴────────────────────────────────────────────────┘
#
#  To verify Node.js is installed correctly, open a terminal and run:
node --version
#  Expected: v18.x.x  or  v20.x.x  or higher
npm --version
#  Expected: 9.x.x  or  10.x.x  or higher


# ────────────────────────────────────────────────────────────
# SECTION 2 — STEP 1: RUN THE WEB APPLICATION
# (No setup needed — just open the file)
# ────────────────────────────────────────────────────────────

# On Windows — double-click index.html in File Explorer
# OR run this in PowerShell (replace the path with where you copied it):
start .\bridge-health-app\index.html

# On Mac:
open ./bridge-health-app/index.html

# On Linux:
xdg-open ./bridge-health-app/index.html

# ✅ The app opens in your browser immediately.
# ✅ No server. No install. No terminal needed.
# ✅ Works offline.
# App URL when opened directly: file:///path/to/bridge-health-app/index.html

# OPTIONAL — Serve on the network so other devices can access it:
npm install -g serve
serve ./bridge-health-app --listen 3000
# → http://localhost:3000   (accessible from any device on the same Wi-Fi)


# ────────────────────────────────────────────────────────────
# SECTION 3 — STEP 2: BUILD THE MCP SERVER
# (Required for IBM Bob AI integration)
# ────────────────────────────────────────────────────────────

# Navigate to the MCP server folder (adjust path to where you copied it):
cd bridge-health-mcp

# Install dependencies (downloads ~12 packages, takes ~30 seconds):
npm install

# Build TypeScript → JavaScript:
npm run build

# Verify build succeeded:
# Windows PowerShell:
Test-Path ".\build\index.js"
# Expected output: True

# Mac / Linux:
ls ./build/index.js
# Expected output: ./build/index.js


# ────────────────────────────────────────────────────────────
# SECTION 4 — STEP 3: FIND YOUR HOME DIRECTORY PATH
# (Needed to register the MCP server with IBM Bob)
# ────────────────────────────────────────────────────────────

# Windows PowerShell — print your home path:
echo $env:USERPROFILE
# Example output: C:\Users\john

# Mac / Linux — print your home path:
echo $HOME
# Example output: /Users/john   OR   /home/john

# You will use this path in Section 5 below.
# Replace [HOME] in all paths with whatever this command printed.


# ────────────────────────────────────────────────────────────
# SECTION 5 — STEP 4: COPY MCP SERVER TO BOB'S FOLDER
# ────────────────────────────────────────────────────────────

# Windows PowerShell:
# (replace C:\Users\john with YOUR home path from Section 4)

New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\mcp-servers"
Copy-Item -Recurse -Force .\bridge-health-mcp "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp"

# Rebuild inside Bob's folder (so the path in mcp.json is correct):
cd "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp"
npm install
npm run build

# Mac / Linux:
mkdir -p ~/.bob/mcp-servers
cp -r ./bridge-health-mcp ~/.bob/mcp-servers/bridge-health-mcp
cd ~/.bob/mcp-servers/bridge-health-mcp
npm install
npm run build


# ────────────────────────────────────────────────────────────
# SECTION 6 — STEP 5: REGISTER THE MCP SERVER WITH IBM BOB
# (Creates mcp.json with the correct path for this PC)
# ────────────────────────────────────────────────────────────

# Windows PowerShell — run this block as-is (it auto-detects your username):

New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\settings"

$mcpPath = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\build\index.js" -replace '\\', '/'

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

Set-Content -Path "$env:USERPROFILE\.bob\settings\mcp.json" -Value $mcpJson

# Verify it was written correctly:
Get-Content "$env:USERPROFILE\.bob\settings\mcp.json"

# Expected output (with YOUR username, not faalk):
# {
#   "mcpServers": {
#     "bridge-health": {
#       "command": "node",
#       "args": ["C:/Users/YOUR_USERNAME/.bob/mcp-servers/bridge-health-mcp/build/index.js"]
#     }
#   }
# }

# ── Mac / Linux equivalent ──────────────────────────────────
mkdir -p ~/.bob/settings
cat > ~/.bob/settings/mcp.json << EOF
{
  "mcpServers": {
    "bridge-health": {
      "command": "node",
      "args": ["$HOME/.bob/mcp-servers/bridge-health-mcp/build/index.js"]
    }
  }
}
EOF

cat ~/.bob/settings/mcp.json


# ────────────────────────────────────────────────────────────
# SECTION 7 — STEP 6: INSTALL THE BOB CUSTOM MODE (ARIA)
# ────────────────────────────────────────────────────────────

# Windows PowerShell:
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\settings"

$yaml = @'
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
      bridge-health MCP server tools before forming conclusions. Format all
      outputs with clear section headers. Flag CRITICAL and HIGH urgency
      findings prominently at the top of any report.
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

Set-Content -Path "$env:USERPROFILE\.bob\settings\custom_modes.yaml" -Value $yaml

# Verify:
Get-Content "$env:USERPROFILE\.bob\settings\custom_modes.yaml"

# Mac / Linux:
mkdir -p ~/.bob/settings
cat > ~/.bob/settings/custom_modes.yaml << 'EOF'
customModes:
  - slug: bridge-monitor
    name: Bridge Health Monitor
    roleDefinition: >-
      You are ARIA (Autonomous Real-time Infrastructure Analyst), an expert AI
      assistant specialising in bridge structural health monitoring (SHM) and
      predictive maintenance. You have deep knowledge of civil engineering
      principles, sensor technologies, signal processing, and RCM frameworks.
    whenToUse: Use when monitoring bridge sensor data, analysing structural health, or planning bridge maintenance.
    customInstructions: >-
      Always activate the bridge-health-analysis skill at the start of any
      monitoring or analysis session. Call MCP tools before forming conclusions.
    groups:
      - read
      - edit
      - execute
      - mcp
      - skill
      - todo
      - subagent
      - mode
EOF


# ────────────────────────────────────────────────────────────
# SECTION 8 — STEP 7: INSTALL THE BOB SKILL
# ────────────────────────────────────────────────────────────

# Windows PowerShell:
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\skills\bridge-health-analysis"
Copy-Item .\bridge-health-app\skill\SKILL.md "$env:USERPROFILE\.bob\skills\bridge-health-analysis\SKILL.md"

# If you don't have the SKILL.md file separately, create it:
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\skills\bridge-health-analysis"

$skill = @'
---
name: bridge-health-analysis
description: >-
  Use when the user wants to analyse bridge sensor data, assess structural
  health, detect anomalies or defects, run predictive maintenance analysis,
  or generate a bridge condition report.
---

# Bridge Health Monitoring and Predictive Maintenance Analysis

Follow these steps every time a bridge analysis or monitoring session is requested.

## Step 1 — Establish Session Context
Ask for: Bridge ID / name, data source (MCP / file / manual), analysis goal.

## Step 2 — Ingest Sensor Data
Call MCP tools: get_bridge_status → get_sensor_readings → get_sensor_history (for alerts).

## Step 3 — Pre-process and Validate
Check: data gaps >5%, outliers beyond ±3σ, FAULT/OFFLINE sensors.

## Step 4 — Structural Assessment
4a Strain: flag if >80% design limit (HIGH) or >95% (CRITICAL).
4b Vibration: flag frequency shifts >5% from baseline.
4c Displacement: compare to L/360 live load and L/240 total load limits.
4d Corrosion: flag if half-cell potential < -350 mV (HIGH) or < -500 mV (CRITICAL).
4e Load: flag overload events >120% design vehicle weight.

## Step 5 — Anomaly Detection
Call detect_anomalies MCP tool. Z-score > 3.5 = ANOMALY.

## Step 6 — Predictive RUL
Call run_predictive_model for fatigue / corrosion / settlement.

## Step 7 — Maintenance Recommendations
Call get_maintenance_recommendations. Present as CRITICAL / HIGH / MEDIUM / LOW table.

## Step 8 — Condition Report
Output structured report: Executive Summary, Critical Findings, Assessment, Plan, Standards.

## Step 9 — Archive
Offer to write report to: bridge-reports/<bridge_id>_<YYYYMMDD>_condition_report.md
'@

Set-Content -Path "$env:USERPROFILE\.bob\skills\bridge-health-analysis\SKILL.md" -Value $skill

# Mac / Linux:
mkdir -p ~/.bob/skills/bridge-health-analysis
# (copy SKILL.md from the project, or paste the content above)


# ────────────────────────────────────────────────────────────
# SECTION 9 — VERIFY EVERYTHING IS IN PLACE
# ────────────────────────────────────────────────────────────

# Windows PowerShell — run all checks at once:
Write-Host "=== ARIA Setup Verification ===" -ForegroundColor Cyan

# 1. Node.js
$nodeVer = node --version 2>$null
if ($nodeVer) { Write-Host "[OK] Node.js $nodeVer" -ForegroundColor Green }
else { Write-Host "[FAIL] Node.js not found — install from https://nodejs.org" -ForegroundColor Red }

# 2. MCP server build
$buildExists = Test-Path "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\build\index.js"
if ($buildExists) { Write-Host "[OK] MCP server build found" -ForegroundColor Green }
else { Write-Host "[FAIL] MCP build missing — run: cd bridge-health-mcp && npm install && npm run build" -ForegroundColor Red }

# 3. mcp.json
$mcpExists = Test-Path "$env:USERPROFILE\.bob\settings\mcp.json"
if ($mcpExists) { Write-Host "[OK] mcp.json found" -ForegroundColor Green }
else { Write-Host "[FAIL] mcp.json missing — re-run Section 6" -ForegroundColor Red }

# 4. custom_modes.yaml
$modeExists = Test-Path "$env:USERPROFILE\.bob\settings\custom_modes.yaml"
if ($modeExists) { Write-Host "[OK] custom_modes.yaml found" -ForegroundColor Green }
else { Write-Host "[FAIL] custom_modes.yaml missing — re-run Section 7" -ForegroundColor Red }

# 5. Skill
$skillExists = Test-Path "$env:USERPROFILE\.bob\skills\bridge-health-analysis\SKILL.md"
if ($skillExists) { Write-Host "[OK] bridge-health-analysis skill found" -ForegroundColor Green }
else { Write-Host "[FAIL] SKILL.md missing — re-run Section 8" -ForegroundColor Red }

# 6. Web app
$webExists = Test-Path ".\bridge-health-app\index.html"
if ($webExists) { Write-Host "[OK] Web app index.html found" -ForegroundColor Green }
else { Write-Host "[FAIL] index.html not found — check your folder path" -ForegroundColor Red }

Write-Host "===============================" -ForegroundColor Cyan

# ✅ All [OK] = ready to go
# ❌ Any [FAIL] = follow the fix instruction shown


# ────────────────────────────────────────────────────────────
# SECTION 10 — START USING ARIA ON THE NEW PC
# ────────────────────────────────────────────────────────────

# 1. Open the web dashboard:
start .\bridge-health-app\index.html

# 2. Open IBM Bob → mode picker → "Bridge Health Monitor"

# 3. In Bob, try these commands:
#      list all bridges
#      get sensor readings for BRG-001
#      analyse all sensor data for BRG-001
#      what is the corrosion risk on Riverside Highway Bridge?
#      generate a full condition report
#      run predictive model for deck using fatigue model on BRG-001
#      what are the top 3 maintenance priorities?


# ────────────────────────────────────────────────────────────
# SECTION 11 — RUNNING TESTS ON THE NEW PC
# ────────────────────────────────────────────────────────────

# ── Web App ─────────────────────────────────────────────────
# Open index.html and confirm:
#   Dashboard  → Health score 62, 3 alerts, chart visible
#   BRG-002    → Switch bridge → Health score 88, 0 alerts
#   Sensors    → Filter by Corrosion → S004-CORR-DECK card shown
#   Anomaly    → Run Detection → bar chart + 2 anomalies
#   Predictive → Rebar + Corrosion → RUL estimate card
#   Maintenance→ Generate Plan → 4 priority sections
#   Report     → Generate Full Report → full text rendered
#   AI Chat    → "corrosion risk" → ARIA responds
#   Live data  → Wait 8 seconds → chart values update

# ── MCP Server ───────────────────────────────────────────────
# Windows:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\build\index.js"
# Expected: JSON with 9 tool names

# Mac / Linux:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node ~/.bob/mcp-servers/bridge-health-mcp/build/index.js

# ── IBM Bob ───────────────────────────────────────────────────
# Mode: Bridge Health Monitor → type: "list all bridges"
# Expected: BRG-001 and BRG-002 listed with health scores


# ────────────────────────────────────────────────────────────
# SECTION 12 — TROUBLESHOOTING ON A NEW PC
# ────────────────────────────────────────────────────────────
#
#  ┌─────────────────────────────────────────┬────────────────────────────────────────────────────────┐
#  │ Problem                                 │ Fix                                                    │
#  ├─────────────────────────────────────────┼────────────────────────────────────────────────────────┤
#  │ Web app blank page                      │ Move folder to Desktop; reopen index.html              │
#  │ Charts not showing                      │ Use Chrome 90+ or Edge                                 │
#  │ 'node' not recognized                   │ Install Node.js 18 LTS — restart terminal after        │
#  │ npm install fails with ENOENT           │ Check you are inside the bridge-health-mcp folder      │
#  │ MCP shows Disconnected in Bob           │ Path in mcp.json has wrong username — re-run Section 6 │
#  │ Bob mode not in picker                  │ custom_modes.yaml not in ~/.bob/settings/ — re-run S7  │
#  │ Bob skill not activating                │ Start a NEW Bob conversation after installing skill    │
#  │ TypeScript errors on build              │ Upgrade Node.js to v18+ ; delete node_modules; re-run  │
#  │ Permission denied (Mac/Linux)           │ chmod +x ~/.bob/mcp-servers/bridge-health-mcp/build/index.js │
#  │ mcp.json path still has old username    │ Re-run Section 6 — the script auto-detects username    │
#  └─────────────────────────────────────────┴────────────────────────────────────────────────────────┘


# ────────────────────────────────────────────────────────────
# SECTION 13 — QUICK CHEATSHEET (all commands, any PC)
# ────────────────────────────────────────────────────────────

# Open web app:
start .\bridge-health-app\index.html                      # Windows
open  ./bridge-health-app/index.html                      # Mac
xdg-open ./bridge-health-app/index.html                   # Linux

# Serve web app on network (port 3000):
npm install -g serve
serve ./bridge-health-app --listen 3000

# Install + build MCP server:
cd bridge-health-mcp && npm install && npm run build

# Register MCP server (Windows — auto-detects username):
$p = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\build\index.js" -replace '\\','/'
New-Item -Force -Path "$env:USERPROFILE\.bob\settings" -ItemType Directory | Out-Null
Set-Content "$env:USERPROFILE\.bob\settings\mcp.json" "{`"mcpServers`":{`"bridge-health`":{`"command`":`"node`",`"args`":[`"$p`"]}}}"

# Register MCP server (Mac/Linux — auto-detects home):
mkdir -p ~/.bob/settings
echo "{\"mcpServers\":{\"bridge-health\":{\"command\":\"node\",\"args\":[\"$HOME/.bob/mcp-servers/bridge-health-mcp/build/index.js\"]}}}" > ~/.bob/settings/mcp.json

# Run verification check (Windows):
node --version; Test-Path "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\build\index.js"; Test-Path "$env:USERPROFILE\.bob\settings\mcp.json"; Test-Path "$env:USERPROFILE\.bob\settings\custom_modes.yaml"
# All should return True / version number
