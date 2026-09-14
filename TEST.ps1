# ============================================================
#  ARIA — Bridge Health Monitoring & Predictive Maintenance
#  TEST SCRIPT — Windows PowerShell
#  Runs all tests: Web App, MCP Server, Bob Integration
#  Usage: Right-click → "Run with PowerShell"
#         OR in terminal: .\TEST.ps1
# ============================================================

function OK    { param($msg) Write-Host "  [PASS] $msg" -ForegroundColor Green  }
function FAIL  { param($msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red    }
function INFO  { param($msg) Write-Host "  [INFO] $msg" -ForegroundColor Cyan   }
function WARN  { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function HEAD  { param($msg) Write-Host ""; Write-Host $msg -ForegroundColor Cyan }
function LINE  { Write-Host "  --------------------------------------------" -ForegroundColor DarkGray }

$passed = 0
$failed = 0
$warned = 0

function Pass { param($msg) OK $msg;   $script:passed++ }
function Fail { param($msg) FAIL $msg; $script:failed++ }
function Warn { param($msg) WARN $msg; $script:warned++ }

Clear-Host
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   ARIA Bridge Health Monitor — Test Suite " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildFile = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\build\index.js"


# ════════════════════════════════════════════════════════════
# SUITE 1 — FILE SYSTEM TESTS
# ════════════════════════════════════════════════════════════
HEAD "[ SUITE 1 ] File System — Checking all required files"
LINE

$files = @(
    @{ Path = "$scriptDir\index.html";                                                         Label = "Web app — index.html"           },
    @{ Path = "$scriptDir\styles.css";                                                         Label = "Web app — styles.css"           },
    @{ Path = "$scriptDir\app.js";                                                             Label = "Web app — app.js"               },
    @{ Path = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\src\index.ts";             Label = "MCP server — src/index.ts"      },
    @{ Path = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\package.json";             Label = "MCP server — package.json"      },
    @{ Path = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\tsconfig.json";            Label = "MCP server — tsconfig.json"     },
    @{ Path = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\node_modules";             Label = "MCP server — node_modules (npm install ran)" },
    @{ Path = "$buildFile";                                                                    Label = "MCP server — build/index.js (npm run build ran)" },
    @{ Path = "$env:USERPROFILE\.bob\settings\mcp.json";                                      Label = "Bob config — mcp.json"          },
    @{ Path = "$env:USERPROFILE\.bob\settings\custom_modes.yaml";                             Label = "Bob config — custom_modes.yaml" },
    @{ Path = "$env:USERPROFILE\.bob\skills\bridge-health-analysis\SKILL.md";                 Label = "Bob skill  — SKILL.md"          }
)

foreach ($f in $files) {
    if (Test-Path $f.Path) { Pass $f.Label }
    else                   { Fail "$($f.Label) — NOT FOUND at $($f.Path)" }
}


# ════════════════════════════════════════════════════════════
# SUITE 2 — ENVIRONMENT TESTS
# ════════════════════════════════════════════════════════════
HEAD "[ SUITE 2 ] Environment — Node.js and npm"
LINE

# Node.js version
$nodeVer = node --version 2>$null
if ($nodeVer) {
    $major = [int]($nodeVer -replace 'v(\d+)\..*','$1')
    if ($major -ge 18) { Pass "Node.js $nodeVer (>= v18 required)" }
    else               { Fail "Node.js $nodeVer is below v18 — upgrade from https://nodejs.org" }
} else { Fail "Node.js not found — install from https://nodejs.org" }

# npm version
$npmVer = npm --version 2>$null
if ($npmVer) { Pass "npm v$npmVer" }
else         { Fail "npm not found" }


# ════════════════════════════════════════════════════════════
# SUITE 3 — MCP SERVER CONTENT TESTS
# ════════════════════════════════════════════════════════════
HEAD "[ SUITE 3 ] MCP Server — Source code validation"
LINE

$srcFile = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\src\index.ts"

if (Test-Path $srcFile) {
    $src = Get-Content $srcFile -Raw

    $toolChecks = @(
        "list_bridges",
        "get_bridge_status",
        "get_sensor_readings",
        "get_sensor_history",
        "analyze_sensor_data",
        "detect_anomalies",
        "run_predictive_model",
        "get_maintenance_recommendations",
        "add_sensor_reading"
    )

    foreach ($tool in $toolChecks) {
        if ($src -match [regex]::Escape($tool)) { Pass "Tool registered: $tool" }
        else                                    { Fail "Tool missing in source: $tool" }
    }

    # Check bridge data
    if ($src -match "BRG-001") { Pass "Bridge BRG-001 data present" }
    else                       { Fail "Bridge BRG-001 data missing" }

    if ($src -match "BRG-002") { Pass "Bridge BRG-002 data present" }
    else                       { Fail "Bridge BRG-002 data missing" }

    # Check MCP transport
    if ($src -match "StdioServerTransport") { Pass "stdio transport configured" }
    else                                    { Fail "StdioServerTransport not found in source" }

} else {
    Fail "src/index.ts not found — skipping source checks"
}


# ════════════════════════════════════════════════════════════
# SUITE 4 — MCP SERVER RUNTIME TEST
# ════════════════════════════════════════════════════════════
HEAD "[ SUITE 4 ] MCP Server — Runtime connection test"
LINE

if (Test-Path $buildFile) {

    # Test 1: tools/list
    INFO "Sending tools/list request..."
    try {
        $payload = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
        $raw = $payload | node $buildFile 2>$null
        $json = $raw | ConvertFrom-Json -ErrorAction Stop
        $tools = $json.result.tools

        if ($tools.Count -eq 9) {
            Pass "tools/list returned exactly 9 tools"
        } elseif ($tools.Count -gt 0) {
            Warn "tools/list returned $($tools.Count) tools (expected 9)"
        } else {
            Fail "tools/list returned 0 tools"
        }

        # Verify specific tool names
        $toolNames = $tools | ForEach-Object { $_.name }
        foreach ($expected in @("list_bridges","get_bridge_status","analyze_sensor_data","detect_anomalies","run_predictive_model")) {
            if ($toolNames -contains $expected) { Pass "  Tool visible: $expected" }
            else                                { Fail "  Tool missing from runtime: $expected" }
        }

    } catch {
        Fail "MCP server did not respond to tools/list — check build/index.js"
    }

    # Test 2: list_bridges tool call
    INFO "Calling list_bridges tool..."
    try {
        $callPayload = '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_bridges","arguments":{}}}'
        $raw2 = $callPayload | node $buildFile 2>$null
        $json2 = $raw2 | ConvertFrom-Json -ErrorAction Stop
        $content = $json2.result.content[0].text
        $bridges = $content | ConvertFrom-Json -ErrorAction Stop

        if ($bridges.Count -ge 2)             { Pass "list_bridges returned $($bridges.Count) bridges" }
        else                                   { Fail "list_bridges returned fewer than 2 bridges" }

        $brg001 = $bridges | Where-Object { $_.id -eq "BRG-001" }
        if ($brg001)                           { Pass "BRG-001 (Riverside Highway Bridge) present" }
        else                                   { Fail "BRG-001 not found in list_bridges response" }

        $brg002 = $bridges | Where-Object { $_.id -eq "BRG-002" }
        if ($brg002)                           { Pass "BRG-002 (Northgate Cable-Stay Bridge) present" }
        else                                   { Fail "BRG-002 not found in list_bridges response" }

    } catch {
        Fail "list_bridges tool call failed"
    }

    # Test 3: get_bridge_status for BRG-001
    INFO "Calling get_bridge_status for BRG-001..."
    try {
        $statusPayload = '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_bridge_status","arguments":{"bridge_id":"BRG-001"}}}'
        $raw3 = $statusPayload | node $buildFile 2>$null
        $json3 = $raw3 | ConvertFrom-Json -ErrorAction Stop
        $status = $json3.result.content[0].text | ConvertFrom-Json -ErrorAction Stop

        if ($status.id -eq "BRG-001")                    { Pass "BRG-001 status returned correctly" }
        else                                              { Fail "BRG-001 status ID mismatch" }

        if ($status.overall_health_score -eq 62)         { Pass "Health score = 62 (expected)" }
        else                                              { Warn "Health score = $($status.overall_health_score) (expected 62)" }

        if ($status.operational_status -eq "RESTRICTED") { Pass "Operational status = RESTRICTED (expected)" }
        else                                              { Warn "Operational status = $($status.operational_status)" }

        if ($status.alert_count -ge 1)                   { Pass "Active alerts present (count: $($status.alert_count))" }
        else                                              { Fail "No alerts found on BRG-001 (expected at least 1)" }

    } catch {
        Fail "get_bridge_status tool call failed"
    }

    # Test 4: get_sensor_readings
    INFO "Calling get_sensor_readings for BRG-001..."
    try {
        $sensPayload = '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_sensor_readings","arguments":{"bridge_id":"BRG-001","sensor_type":"all"}}}'
        $raw4 = $sensPayload | node $buildFile 2>$null
        $json4 = $raw4 | ConvertFrom-Json -ErrorAction Stop
        $readings = $json4.result.content[0].text | ConvertFrom-Json -ErrorAction Stop

        if ($readings.sensor_count -eq 6) { Pass "get_sensor_readings returned 6 sensors (expected)" }
        else                               { Fail "get_sensor_readings returned $($readings.sensor_count) sensors (expected 6)" }

        $corrSensor = $readings.readings | Where-Object { $_.sensor_type -eq "corrosion" }
        if ($corrSensor)                   { Pass "Corrosion sensor present in readings" }
        else                               { Fail "Corrosion sensor missing from readings" }

    } catch {
        Fail "get_sensor_readings tool call failed"
    }

    # Test 5: detect_anomalies
    INFO "Calling detect_anomalies for BRG-001..."
    try {
        $anomPayload = '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"detect_anomalies","arguments":{"bridge_id":"BRG-001","z_score_threshold":2.5}}}'
        $raw5 = $anomPayload | node $buildFile 2>$null
        $json5 = $raw5 | ConvertFrom-Json -ErrorAction Stop
        $anomResult = $json5.result.content[0].text | ConvertFrom-Json -ErrorAction Stop

        if ($null -ne $anomResult.anomaly_count) { Pass "detect_anomalies responded (anomalies found: $($anomResult.anomaly_count))" }
        else                                      { Fail "detect_anomalies response missing anomaly_count" }

    } catch {
        Fail "detect_anomalies tool call failed"
    }

    # Test 6: run_predictive_model
    INFO "Calling run_predictive_model (fatigue / deck / BRG-001)..."
    try {
        $predPayload = '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"run_predictive_model","arguments":{"bridge_id":"BRG-001","component":"deck","model_type":"fatigue"}}}'
        $raw6 = $predPayload | node $buildFile 2>$null
        $json6 = $raw6 | ConvertFrom-Json -ErrorAction Stop
        $pred = $json6.result.content[0].text | ConvertFrom-Json -ErrorAction Stop

        if ($null -ne $pred.estimated_rul_years) { Pass "run_predictive_model returned RUL = $($pred.estimated_rul_years) years" }
        else                                      { Fail "run_predictive_model response missing estimated_rul_years" }

        if ($pred.confidence_level -in @("HIGH","MEDIUM","LOW")) { Pass "Confidence level = $($pred.confidence_level)" }
        else                                                       { Fail "Confidence level invalid: $($pred.confidence_level)" }

    } catch {
        Fail "run_predictive_model tool call failed"
    }

    # Test 7: get_maintenance_recommendations
    INFO "Calling get_maintenance_recommendations for BRG-001..."
    try {
        $maintPayload = '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_maintenance_recommendations","arguments":{"bridge_id":"BRG-001","include_cost_estimate":true}}}'
        $raw7 = $maintPayload | node $buildFile 2>$null
        $json7 = $raw7 | ConvertFrom-Json -ErrorAction Stop
        $maint = $json7.result.content[0].text | ConvertFrom-Json -ErrorAction Stop

        if ($maint.total_actions -ge 1)    { Pass "Maintenance plan returned $($maint.total_actions) actions" }
        else                               { Fail "No maintenance actions returned" }

        if ($maint.recommendations)        { Pass "Recommendations array present" }
        else                               { Fail "Recommendations array missing" }

    } catch {
        Fail "get_maintenance_recommendations tool call failed"
    }

} else {
    Warn "build/index.js not found — skipping all runtime tests (run INSTALL.ps1 first)"
}


# ════════════════════════════════════════════════════════════
# SUITE 5 — BOB CONFIGURATION TESTS
# ════════════════════════════════════════════════════════════
HEAD "[ SUITE 5 ] IBM Bob Configuration — Validating config files"
LINE

# mcp.json content check
$mcpJsonPath = "$env:USERPROFILE\.bob\settings\mcp.json"
if (Test-Path $mcpJsonPath) {
    try {
        $mcp = Get-Content $mcpJsonPath -Raw | ConvertFrom-Json -ErrorAction Stop
        $server = $mcp.mcpServers.'bridge-health'

        if ($server)                          { Pass "bridge-health server entry found in mcp.json" }
        else                                  { Fail "bridge-health server missing from mcp.json" }

        if ($server.command -eq "node")       { Pass "command = node" }
        else                                  { Fail "command should be 'node', got: $($server.command)" }

        $argPath = $server.args[0]
        if ($argPath -match "bridge-health-mcp") { Pass "args path references bridge-health-mcp" }
        else                                      { Fail "args path looks wrong: $argPath" }

        if ($argPath -match "build.index.js") { Pass "args path points to build/index.js" }
        else                                  { Fail "args path does not point to build/index.js: $argPath" }

        if ($argPath -notmatch "faalk")       { Pass "args path uses current user (not hardcoded 'faalk')" }
        else                                  { Warn "args path may have hardcoded username 'faalk' — re-run INSTALL.ps1" }

    } catch {
        Fail "mcp.json is not valid JSON"
    }
} else {
    Fail "mcp.json not found — run INSTALL.ps1"
}

# custom_modes.yaml content check
$modesPath = "$env:USERPROFILE\.bob\settings\custom_modes.yaml"
if (Test-Path $modesPath) {
    $yaml = Get-Content $modesPath -Raw

    if ($yaml -match "bridge-monitor")         { Pass "slug: bridge-monitor found" }
    else                                        { Fail "slug: bridge-monitor missing from custom_modes.yaml" }

    if ($yaml -match "Bridge Health Monitor")  { Pass "name: Bridge Health Monitor found" }
    else                                        { Fail "name: Bridge Health Monitor missing" }

    if ($yaml -match "ARIA")                   { Pass "ARIA persona found in roleDefinition" }
    else                                        { Fail "ARIA persona missing from roleDefinition" }

    foreach ($group in @("read","edit","execute","mcp","skill")) {
        if ($yaml -match "- $group")           { Pass "Permission group: $group" }
        else                                    { Fail "Permission group missing: $group" }
    }
} else {
    Fail "custom_modes.yaml not found — run INSTALL.ps1"
}

# SKILL.md check
$skillPath = "$env:USERPROFILE\.bob\skills\bridge-health-analysis\SKILL.md"
if (Test-Path $skillPath) {
    $skill = Get-Content $skillPath -Raw

    if ($skill -match "bridge-health-analysis")  { Pass "Skill name: bridge-health-analysis" }
    else                                          { Fail "Skill name missing from SKILL.md frontmatter" }

    if ($skill -match "Step 1")                  { Pass "Step 1 present in skill workflow" }
    else                                          { Fail "Step 1 missing from SKILL.md" }

    if ($skill -match "Step 9")                  { Pass "Step 9 present (all 9 steps exist)" }
    else                                          { Fail "Step 9 missing — skill workflow incomplete" }

} else {
    Fail "SKILL.md not found — run INSTALL.ps1"
}


# ════════════════════════════════════════════════════════════
# SUITE 6 — WEB APP CONTENT TESTS
# ════════════════════════════════════════════════════════════
HEAD "[ SUITE 6 ] Web Application — Source code validation"
LINE

$htmlFile = Join-Path $scriptDir "index.html"
$cssFile  = Join-Path $scriptDir "styles.css"
$jsFile   = Join-Path $scriptDir "app.js"

if (Test-Path $htmlFile) {
    $html = Get-Content $htmlFile -Raw

    foreach ($page in @("dashboard","sensors","anomalies","predictive","maintenance","report","ai")) {
        if ($html -match "page-$page") { Pass "HTML page section: $page" }
        else                           { Fail "HTML page section missing: page-$page" }
    }

    if ($html -match "bridge-select")   { Pass "Bridge selector element present" }
    else                                 { Fail "Bridge selector missing from HTML" }

    if ($html -match "chatMessages")    { Pass "AI chat container present" }
    else                                 { Fail "AI chat container missing from HTML" }

} else { Fail "index.html not found" }

if (Test-Path $cssFile) {
    $css = Get-Content $cssFile -Raw

    if ($css -match "--bg")             { Pass "CSS custom properties (dark theme) present" }
    else                                 { Fail "CSS custom properties missing" }

    if ($css -match "kpi-card")         { Pass "KPI card styles present" }
    else                                 { Fail "KPI card styles missing" }

    if ($css -match "sensor-card")      { Pass "Sensor card styles present" }
    else                                 { Fail "Sensor card styles missing" }

} else { Fail "styles.css not found" }

if (Test-Path $jsFile) {
    $js = Get-Content $jsFile -Raw

    foreach ($bridge in @("BRG-001","BRG-002")) {
        if ($js -match $bridge)         { Pass "Bridge data present: $bridge" }
        else                             { Fail "Bridge data missing: $bridge" }
    }

    foreach ($fn in @("renderDashboard","renderSensors","runAnomalyDetection","runPredictiveModel","generateMaintenancePlan","generateReport","sendChat")) {
        if ($js -match $fn)             { Pass "Function defined: $fn" }
        else                             { Fail "Function missing: $fn" }
    }

    if ($js -match "setInterval")       { Pass "Live simulation timer present (setInterval)" }
    else                                 { Fail "Live simulation timer missing" }

    if ($js -match "drawLineChart")     { Pass "Canvas chart renderer present" }
    else                                 { Fail "Canvas chart renderer missing" }

} else { Fail "app.js not found" }


# ════════════════════════════════════════════════════════════
# FINAL RESULTS
# ════════════════════════════════════════════════════════════
$total = $passed + $failed + $warned

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   TEST RESULTS                            " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Total  : $total" -ForegroundColor White
Write-Host "  Passed : $passed" -ForegroundColor Green
if ($warned -gt 0) {
Write-Host "  Warned : $warned" -ForegroundColor Yellow }
if ($failed -gt 0) {
Write-Host "  Failed : $failed" -ForegroundColor Red }
Write-Host ""

if ($failed -eq 0 -and $warned -eq 0) {
    Write-Host "  ALL TESTS PASSED " -ForegroundColor Green
    Write-Host "  ARIA is fully operational and ready to use." -ForegroundColor Green
} elseif ($failed -eq 0) {
    Write-Host "  ALL TESTS PASSED (with $warned warning(s))" -ForegroundColor Yellow
    Write-Host "  ARIA is operational. Review warnings above." -ForegroundColor Yellow
} else {
    Write-Host "  $failed TEST(S) FAILED" -ForegroundColor Red
    Write-Host "  Run INSTALL.ps1 to fix missing components." -ForegroundColor Red
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "  Press Enter to exit"
