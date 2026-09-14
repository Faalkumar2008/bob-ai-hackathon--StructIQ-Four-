# Architecture
## ARIA — System Design & Technical Architecture

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACES                          │
│                                                                 │
│   ┌──────────────────────────┐    ┌──────────────────────────┐  │
│   │    Web Dashboard (SPA)   │    │     IBM Bob AI Chat       │  │
│   │  index.html + app.js     │    │  Bridge Health Monitor   │  │
│   │  7 pages, canvas charts  │    │  Mode (ARIA persona)     │  │
│   └──────────────────────────┘    └──────────┬───────────────┘  │
└──────────────────────────────────────────────│──────────────────┘
                                               │
┌──────────────────────────────────────────────│──────────────────┐
│                     IBM BOB AI LAYER          │                  │
│                                               ▼                  │
│   ┌──────────────────────┐    ┌──────────────────────────────┐  │
│   │   Custom Skill       │    │       MCP Server             │  │
│   │ bridge-health-       │◄───│   bridge-health-mcp          │  │
│   │ analysis (9 steps)   │    │   Node.js / TypeScript       │  │
│   └──────────────────────┘    │   stdio transport            │  │
│                                │   9 registered tools        │  │
│   ┌──────────────────────┐    └──────────────┬───────────────┘  │
│   │   Custom Mode        │                   │                  │
│   │  bridge-monitor      │                   │                  │
│   │  (ARIA persona)      │                   │                  │
│   └──────────────────────┘                   │                  │
└─────────────────────────────────────────────-│──────────────────┘
                                               │
┌──────────────────────────────────────────────│──────────────────┐
│                     DATA LAYER                ▼                  │
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐    │
│   │              In-Memory Sensor Registry                 │    │
│   │         (replace with real DB/API in production)       │    │
│   │                                                        │    │
│   │   BRG-001: 6 sensors   │   BRG-002: 4 sensors         │    │
│   └────────────────────────────────────────────────────────┘    │
│                                                                  │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│   │  Strain  │ │Vibration │ │Displace. │ │Corrosion│Temp│Load│  │
│   │  Gauges  │ │  MEMS    │ │  LVDT    │ │Half-cell│    │WIM │  │
│   └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Layer 1 — Data Collection (IoT Sensors)

### Sensor Types and Placement

| Sensor | Type | Location | Sampling |
|--------|------|----------|---------|
| S001-STRAIN-MID | Strain gauge | Mid-span bottom flange | Continuous |
| S002-DISP-MID | LVDT | Mid-span vertical | Continuous |
| S003-VIB-PIER1 | Accelerometer | Pier 1 North | Continuous |
| S004-CORR-DECK | Half-cell probe | Deck rebar zone B | Hourly |
| S005-TEMP-MAIN | Thermocouple | Main girder | Continuous |
| S006-LOAD-ENTRY | WIM load cell | Entry axle point | Per-vehicle |

### Data Flow (Production)
```
Physical Sensor → DAQ Unit → Edge Gateway → REST API / MQTT → MCP Server
```

### Current Implementation (Prototype)
```
Simulated BRIDGES registry in src/index.ts → MCP tool handlers → Bob / Web App
```
Replace the `BRIDGES` object and `generateHistory()` function with real API calls
to connect live sensors.

---

## Layer 2 — MCP Server

### Technology Stack
- **Runtime:** Node.js 18+ (ESM modules)
- **Language:** TypeScript 5.5, compiled to ES2022
- **Transport:** stdio (Bob spawns the server as a child process)
- **Schema validation:** Zod v3
- **Protocol:** Model Context Protocol (MCP) v1.0

### Tool Registry

| Tool | Input Schema | Output |
|------|-------------|--------|
| `list_bridges` | none | Array of bridge summaries |
| `get_bridge_status` | `bridge_id: string` | Full bridge status object |
| `get_sensor_readings` | `bridge_id, sensor_type?` | Array of sensor readings |
| `get_sensor_history` | `bridge_id, sensor_id, hours?` | Time-series + statistics |
| `analyze_sensor_data` | `bridge_id` | Findings array + health score |
| `detect_anomalies` | `bridge_id, z_score_threshold?` | Anomaly array |
| `run_predictive_model` | `bridge_id, component, model_type, load_cycles?` | RUL estimate |
| `get_maintenance_recommendations` | `bridge_id, include_cost_estimate?` | Prioritised plan |
| `add_sensor_reading` | `bridge_id, sensor_id, value, status?` | Confirmation |

### Analysis Algorithms

**Anomaly Detection — Z-Score**
```
z = |( x - μ ) / σ|
where μ = mean of sensor group, σ = standard deviation
Threshold: z ≥ 3.0 → ANOMALY, z ≥ 4.0 → EXTREME_OUTLIER
```

**Fatigue RUL — Miner's Rule (Paris-Law approximation)**
```
D = (age × cycles_per_day × 365) / (design_life_cycles)
RUL = (1 - D) × design_life_years
```

**Corrosion RUL — Faraday cover depletion**
```
rate = f(half_cell_potential)    [0.04 – 0.25 mm/year]
RUL = (cover_remaining - min_cover) / rate
```

**Settlement RUL — Linear regression**
```
rate = current_displacement / bridge_age     [mm/year]
RUL = (L/360_limit - current_displacement) / rate
```

---

## Layer 3 — IBM Bob AI Integration

### Custom Mode — `bridge-monitor`
```
File:  ~/.bob/settings/custom_modes.yaml
Slug:  bridge-monitor
Name:  Bridge Health Monitor
Persona: ARIA — civil engineering SHM expert
Groups: read, edit, execute, mcp, skill, todo, subagent, mode
```

### Custom Skill — `bridge-health-analysis`
```
File:  ~/.bob/skills/bridge-health-analysis/SKILL.md
Trigger: auto-activates when user asks about bridge analysis
Steps:
  1. Session context
  2. Sensor data ingestion (MCP tools)
  3. Pre-process & validate
  4. Structural assessment (per sensor type)
  5. Anomaly detection
  6. Predictive RUL modelling
  7. Maintenance recommendations
  8. Condition report generation
  9. Archive & handoff
```

### MCP Registration
```json
File: ~/.bob/settings/mcp.json
{
  "mcpServers": {
    "bridge-health": {
      "command": "node",
      "args": ["~/.bob/mcp-servers/bridge-health-mcp/build/index.js"]
    }
  }
}
```

---

## Layer 4 — Web Dashboard

### Technology
- **Language:** Vanilla HTML5 / CSS3 / JavaScript (ES2022)
- **Dependencies:** Zero external libraries
- **Charts:** Custom Canvas API renderer (drawLineChart, drawBarChart, drawRadarChart)
- **Routing:** Client-side page switching (no URL changes)

### Page Architecture

| Page ID | Module | Key Functions |
|---------|--------|--------------|
| `dashboard` | Dashboard | `renderDashboard()`, `drawSensorChart()`, `drawHealthChart()` |
| `sensors` | Sensor Monitor | `renderSensors()` |
| `anomalies` | Anomaly Detection | `runAnomalyDetection()` |
| `predictive` | Predictive Model | `runPredictiveModel()` |
| `maintenance` | Maintenance Plan | `generateMaintenancePlan()` |
| `report` | Condition Report | `generateReport()` |
| `ai` | AI Assistant | `sendChat()`, `getARIAResponse()` |

### Live Simulation
```javascript
setInterval(() => {
  // Update one random sensor value every 8 seconds
  // Triggers chart and card re-render on active page
}, 8000);
```

---

## Deployment Architecture (Production)

```
Internet
    │
    ▼
┌─────────────────────────────┐
│   CDN / Static Host         │  ← Serve index.html, styles.css, app.js
│   (Netlify / S3 / Nginx)    │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│   REST API / WebSocket      │  ← Replace MCP in-memory data
│   (Express / FastAPI)       │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│   Time-Series Database      │  ← InfluxDB / TimescaleDB
│   + Relational DB           │  ← PostgreSQL (bridge registry)
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│   IoT Gateway               │  ← MQTT broker / edge compute
│   (AWS IoT / Azure IoT Hub) │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│   Physical Sensors          │  ← Strain, vibration, displacement,
│   on Bridge Structure       │    corrosion, temperature, load
└─────────────────────────────┘
```

---

## Security Considerations (Production)

| Concern | Mitigation |
|---------|-----------|
| Sensor data integrity | TLS on all API endpoints, signed sensor payloads |
| MCP server access | Bob manages server lifecycle; no external port exposed |
| API keys | Environment variables only; never in source code |
| Web app | No auth required for read-only dashboard (add OAuth for write operations) |
| Data retention | Sensor time-series compressed after 90 days; raw data archived |
