# 🌉 ARIA — Bridge Health Monitoring & Predictive Maintenance Assistant

> **Autonomous Real-time Infrastructure Analyst** — IBM Bob AI Module

[![Platform](https://img.shields.io/badge/Platform-IBM%20Bob%20AI-blue)]()
[![MCP Tools](https://img.shields.io/badge/MCP%20Tools-9-purple)]()
[![Web App](https://img.shields.io/badge/Web%20App-Zero%20Dependencies-green)]()
[![Track](https://img.shields.io/badge/Track-AI%20for%20Infrastructure-orange)]()

---

## Repository Structure

```
aria-bridge-health/
│
├── src/                              # Full Data/AI + CLI source code
│   ├── index.ts                      # MCP server — 9 tools, entry point
│   ├── data/
│   │   ├── ingest.ts                 # Raw sensor ingestion, unit normalisation, schema validation
│   │   └── preprocess.ts             # Gap detection, IQR outlier flagging, rolling stats, trend slope
│   ├── models/
│   │   ├── anomaly.ts                # Z-score, threshold, and combined anomaly detection
│   │   └── predictive.ts             # Paris-law fatigue, Faraday corrosion, linear settlement RUL
│   ├── api/
│   │   └── server.ts                 # Zero-dep HTTP API server wrapping all MCP tool handlers
│   ├── cli/
│   │   └── aria.ts                   # CLI — analyse / registry / anomaly / rul / schedule commands
│   ├── lib/
│   │   └── bridge-registry.ts        # BridgeRegistry, HealthScoringEngine, AlertBus (shared logic)
│   ├── utils/
│   │   └── helpers.ts                # Formatting, Logger, date/time, unit conversions, array stats
│   └── notebooks/
│       ├── 01-sensor-exploration.md  # Baseline profiling, gap detection, rolling stats
│       └── 02-anomaly-benchmarking.md# Z-score vs threshold vs combined — precision/recall analysis
│
├── index.html                        # SPA shell — 7 page templates
├── styles.css                        # Dark-theme design system
├── app.js                            # All application logic (~440 lines)
├── ARIA_Bridge_Health_Presentation.pptx   # 8-slide pitch deck
├── INSTALL.ps1                       # One-click installer (Windows)
├── RUN.ps1                           # Application launcher (Windows)
├── TEST.ps1                          # Full test suite — 60+ checks (Windows)
├── TROUBLESHOOT.ps1                  # Auto-diagnose and fix 18 issue types (Windows)
├── SETUP.md                          # Portable setup guide
│
├── docs/                             # Written documentation
│   ├── problem-statement.md          # The bridge infrastructure crisis
│   ├── solution-overview.md          # ARIA's 5 pillars and impact metrics
│   ├── architecture.md               # Full system design and technical diagrams
│   ├── setup-guide.md                # Step-by-step installation and usage guide
│   └── JUDGES.md                     # Known limitations and what we're proud of
│
├── demo/                             # Demo artifacts
│   ├── screenshots/
│   │   └── screenshots-guide.txt     # Instructions for capturing 10 key screenshots
│   └── demo-video-link.txt           # Demo video URL + 4-minute recording script
│
├── package.json                      # Node.js project manifest (MCP + API + CLI)
├── tsconfig.json                     # TypeScript compiler configuration
├── .gitignore                        # Excludes node_modules/, build/, *.mp4
├── submission.yaml                   # Structured submission metadata
└── README.md                         # This file
```

---

## Quick Start

### Web Application (no install needed)
```
Open: bridge-health-app/index.html
```
Double-click in File Explorer. Zero dependencies. Works offline. Opens instantly.

### Full Setup (Bob AI integration)
```powershell
# Windows — right-click → "Run with PowerShell"
.\bridge-health-app\INSTALL.ps1
```

---

## What is ARIA?

ARIA monitors bridges 24/7 using IoT sensors, detects structural anomalies in real
time, predicts remaining useful life of key components, and generates prioritised
maintenance plans — all accessible through IBM Bob's natural language interface.

### The Problem
- 42% of US bridges are 50+ years old
- Inspections happen only every 2 years
- $123 billion maintenance backlog
- Zero real-time early-warning systems at scale

### The Solution — 5 Pillars
```
IoT Sensors → Anomaly Detection → Predictive RUL → IBM Bob AI → Maintenance Plan
```

---

## IBM Bob Integration

| Component | File | Purpose |
|-----------|------|---------|
| Custom Mode | `custom_modes.yaml` | ARIA persona — civil engineering AI expert |
| Custom Skill | `SKILL.md` | 9-step analysis workflow, auto-activates |
| MCP Server | `src/index.ts` | 9 tools Bob calls to query sensor data |

**In Bob:** Mode picker → **Bridge Health Monitor** → Ask ARIA anything.

---

## MCP Server — 9 Tools

| Tool | Description |
|------|-------------|
| `list_bridges` | All bridges with health scores and alert counts |
| `get_bridge_status` | Full status for one bridge |
| `get_sensor_readings` | Live readings filtered by sensor type |
| `get_sensor_history` | Time-series up to 720 hours back |
| `analyze_sensor_data` | Threshold analysis + computed health score |
| `detect_anomalies` | Z-score statistical outlier detection |
| `run_predictive_model` | RUL: fatigue / corrosion / settlement |
| `get_maintenance_recommendations` | Prioritised action plan + cost estimates |
| `add_sensor_reading` | Inject test values for simulation |

---

## Pre-Loaded Bridges

| Bridge | Type | Health | Status |
|--------|------|--------|--------|
| BRG-001 — Riverside Highway Bridge | Prestressed Concrete Beam | 62/100 | RESTRICTED |
| BRG-002 — Northgate Cable-Stay Bridge | Cable-Stayed | 88/100 | OPERATIONAL |

---

## Scripts

| Script | Usage |
|--------|-------|
| `INSTALL.ps1` | Run **once** on a new PC — sets up everything |
| `RUN.ps1` | Run **every time** to launch the application |
| `TEST.ps1` | Run **anytime** — 60+ automated checks |
| `TROUBLESHOOT.ps1` | Run **when something breaks** — auto-fixes 18 issues |

---

## Documentation

| Document | Contents |
|----------|---------|
| [`docs/problem-statement.md`](docs/problem-statement.md) | Statistics, root causes, human cost, stakeholders |
| [`docs/solution-overview.md`](docs/solution-overview.md) | 5 pillars, capabilities, impact metrics |
| [`docs/architecture.md`](docs/architecture.md) | System diagrams, algorithms, deployment architecture |
| [`docs/setup-guide.md`](docs/setup-guide.md) | Installation, configuration, troubleshooting reference |

---

## Standards Compliance

`AASHTO LRFD 9th Ed.` · `AASHTO MBE 3rd Ed.` · `Eurocode EN 1337` ·
`BS 5400` · `ISO 13822` · `ASTM C876` · `IEEE 1451`

---

## Team — InfraAI

| Name | Role | Built |
|------|------|-------|
| [Your Name] | Team Lead & AI Architect | Bob mode, skill, integration |
| [Member 2] | Backend Engineer | MCP server, 9 tools, models |
| [Member 3] | Frontend Engineer | Web dashboard, charts, AI chat |
| [Member 4] | Civil Engineering Advisor | Standards, sensor strategy |

> *Replace names in `submission.yaml` and `ARIA_Bridge_Health_Presentation.pptx` (Slide 8)*

---

*Built with IBM Bob AI · ARIA v1.0.0*
