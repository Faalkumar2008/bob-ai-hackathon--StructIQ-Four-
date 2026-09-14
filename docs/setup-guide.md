# Setup Guide
## ARIA — Bridge Health Monitoring & Predictive Maintenance

---

## Quick Start (Web App Only — No Installation)

```
1. Copy the bridge-health-app\ folder to any PC
2. Double-click index.html
3. The application opens immediately in your browser
```

No Node.js. No terminal. No internet connection required.

---

## Prerequisites

| Tool | Version | Required For | Download |
|------|---------|-------------|---------|
| Modern Browser | Chrome 90+ / Edge / Firefox | Web app | Pre-installed |
| Node.js | 18 LTS or higher | MCP server (Bob integration) | https://nodejs.org |
| IBM Bob | Latest | AI assistant mode | Pre-installed |

---

## Automated Setup (Recommended)

Run the installer script — it handles everything automatically:

**Windows:**
```powershell
# Right-click INSTALL.ps1 → "Run with PowerShell"
# OR in terminal:
.\INSTALL.ps1
```

The installer will:
1. Check Node.js version
2. Copy MCP server to `~/.bob/mcp-servers/`
3. Run `npm install` and `npm run build`
4. Write `mcp.json` with auto-detected username
5. Write `custom_modes.yaml` (ARIA mode)
6. Write `SKILL.md` (9-step analysis skill)
7. Verify all components and open the web app

---

## Manual Setup (Step by Step)

### Step 1 — Web Application

No installation needed. Open directly:

```powershell
# Windows
start .\bridge-health-app\index.html

# Mac
open ./bridge-health-app/index.html

# Linux
xdg-open ./bridge-health-app/index.html
```

Optional — serve on local network (port 3000):
```powershell
npm install -g serve
serve ./bridge-health-app --listen 3000
# → http://localhost:3000
```

---

### Step 2 — Install MCP Server Dependencies

```powershell
cd C:\Users\[YOUR_USERNAME]\.bob\mcp-servers\bridge-health-mcp
npm install
```

Expected output:
```
added 12 packages, and audited 13 packages in 8s
found 0 vulnerabilities
```

---

### Step 3 — Build MCP Server

```powershell
npm run build
```

Verify build output:
```powershell
Test-Path ".\build\index.js"
# Expected: True
```

---

### Step 4 — Register MCP Server with Bob

Run this in PowerShell (auto-detects your username):

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\settings" | Out-Null
$mcpPath = "$env:USERPROFILE\.bob\mcp-servers\bridge-health-mcp\build\index.js" -replace '\\','/'
$json = "{`"mcpServers`":{`"bridge-health`":{`"command`":`"node`",`"args`":[`"$mcpPath`"]}}}"
Set-Content "$env:USERPROFILE\.bob\settings\mcp.json" -Value $json
```

Verify:
```powershell
Get-Content "$env:USERPROFILE\.bob\settings\mcp.json"
```

---

### Step 5 — Install Bob Custom Mode (ARIA)

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\settings" | Out-Null
# Copy the contents of docs/custom_modes.yaml to:
# $env:USERPROFILE\.bob\settings\custom_modes.yaml
# OR run INSTALL.ps1 which does this automatically
```

---

### Step 6 — Install Bob Skill

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.bob\skills\bridge-health-analysis" | Out-Null
# Copy SKILL.md to ~/.bob/skills/bridge-health-analysis/SKILL.md
# OR run INSTALL.ps1 which does this automatically
```

---

### Step 7 — Verify Everything

```powershell
.\TEST.ps1
```

All checks should show `[PASS]`. If any show `[FAIL]`, run `TROUBLESHOOT.ps1`.

---

## Using ARIA in IBM Bob

1. Open IBM Bob
2. Click the mode picker → select **Bridge Health Monitor**
3. ARIA activates — the skill loads automatically
4. Try these commands:

```
list all bridges
get sensor readings for BRG-001
analyse all sensor data for BRG-001
what is the corrosion risk on Riverside Highway Bridge?
run predictive model for deck using fatigue model on BRG-001
generate a full condition report
what are the top 3 maintenance priorities?
```

---

## File Reference

| File | Path | Purpose |
|------|------|---------|
| Web app | `bridge-health-app/index.html` | Open in browser |
| MCP source | `src/index.ts` | MCP server TypeScript |
| Bob mode | `~/.bob/settings/custom_modes.yaml` | ARIA persona |
| Bob config | `~/.bob/settings/mcp.json` | MCP registration |
| Bob skill | `~/.bob/skills/bridge-health-analysis/SKILL.md` | Analysis workflow |
| Installer | `INSTALL.ps1` | One-click setup |
| Runner | `RUN.ps1` | Launch application |
| Tests | `TEST.ps1` | Run all checks |
| Troubleshooter | `TROUBLESHOOT.ps1` | Diagnose and fix issues |

---

## Troubleshooting

Run the automated troubleshooter:
```powershell
.\TROUBLESHOOT.ps1
```

| Problem | Fix |
|---------|-----|
| Blank web page | Use Chrome/Edge; move folder to Desktop |
| `node` not recognized | Install Node.js 18 LTS; restart terminal |
| MCP Disconnected in Bob | Run `npm run build`; reopen Bob |
| Mode not in picker | Check `custom_modes.yaml` is in `~/.bob/settings/` |
| Skill not activating | Start a NEW Bob conversation |
| Charts missing | Update browser; disable privacy extensions |
| Port 3000 in use | Use `serve --listen 4000` |
| PowerShell blocked | Run: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |

For full diagnostics, see `TROUBLESHOOT.ps1` which covers 18 issue types.
