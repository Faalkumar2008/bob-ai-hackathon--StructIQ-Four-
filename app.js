/**
 * ARIA — Bridge Health Monitoring & Predictive Maintenance
 * Main application script
 * All simulation logic mirrors the MCP server (bridge-health-mcp/src/index.ts)
 */

"use strict";

// ─────────────────────────────────────────────
// DATA MODEL — mirrors MCP server in-memory DB
// ─────────────────────────────────────────────

const BRIDGES = {
  "BRG-001": {
    id: "BRG-001", name: "Riverside Highway Bridge",
    type: "Prestressed Concrete Beam", year_built: 1988,
    span_m: 120, design_load_kN: 2500, location: "Riverside, CA, USA",
    overall_health_score: 62, operational_status: "RESTRICTED",
    last_inspection: "2024-06-15",
    sensors: [
      { sensor_id: "S001-STRAIN-MID",   sensor_type: "strain",       location: "Mid-span bottom flange",  value: 342,  unit: "μstrain", status: "ALERT",   alert_level: "HIGH",   design_limit: 400 },
      { sensor_id: "S002-DISP-MID",     sensor_type: "displacement", location: "Mid-span vertical",        value: 28.4, unit: "mm",      status: "OK",      alert_level: null,     design_limit: 33.3 },
      { sensor_id: "S003-VIB-PIER1",    sensor_type: "vibration",    location: "Pier 1 North",             value: 4.7,  unit: "Hz",      status: "ALERT",   alert_level: "MEDIUM", design_limit: 8 },
      { sensor_id: "S004-CORR-DECK",    sensor_type: "corrosion",    location: "Deck rebar zone B",        value: -410, unit: "mV(CSE)", status: "ALERT",   alert_level: "HIGH",   design_limit: -350 },
      { sensor_id: "S005-TEMP-MAIN",    sensor_type: "temperature",  location: "Main girder",              value: 34.2, unit: "°C",      status: "OK",      alert_level: null,     design_limit: 60 },
      { sensor_id: "S006-LOAD-ENTRY",   sensor_type: "load",         location: "Entry axle WIM",           value: 2180, unit: "kN",      status: "OK",      alert_level: null,     design_limit: 2500 },
    ]
  },
  "BRG-002": {
    id: "BRG-002", name: "Northgate Cable-Stay Bridge",
    type: "Cable-Stayed", year_built: 2003,
    span_m: 380, design_load_kN: 5000, location: "Northgate, WA, USA",
    overall_health_score: 88, operational_status: "OPERATIONAL",
    last_inspection: "2024-11-02",
    sensors: [
      { sensor_id: "S101-STRAIN-CABLE1", sensor_type: "strain",       location: "Stay cable C1",       value: 198,  unit: "μstrain", status: "OK", alert_level: null, design_limit: 400 },
      { sensor_id: "S102-DISP-TOWER",    sensor_type: "displacement", location: "Tower top lateral",   value: 12.1, unit: "mm",      status: "OK", alert_level: null, design_limit: 52.8 },
      { sensor_id: "S103-VIB-DECK",      sensor_type: "vibration",    location: "Deck centre span",    value: 0.48, unit: "Hz",      status: "OK", alert_level: null, design_limit: 2 },
      { sensor_id: "S104-CORR-ANCHOR",   sensor_type: "corrosion",    location: "Cable anchor block",  value: -290, unit: "mV(CSE)", status: "OK", alert_level: null, design_limit: -350 },
    ]
  }
};

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let currentBridgeId = "BRG-001";
let currentPage = "dashboard";
let sensorFilter = "all";
let chartSensor = null;
let sensorChartRef = null;
let healthChartRef = null;
let anomalyChartRef = null;
let rulChartRef = null;

// ─────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────
function getBridge() { return BRIDGES[currentBridgeId]; }

function severityColor(level) {
  return { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#f59e0b", LOW: "#22c55e", OK: "#22c55e" }[level] || "#8b949e";
}

function statusBadge(status, level) {
  if (status === "OK")      return `<span class="badge badge-ok">OK</span>`;
  if (status === "FAULT")   return `<span class="badge badge-fault">FAULT</span>`;
  if (status === "OFFLINE") return `<span class="badge badge-offline">OFFLINE</span>`;
  if (level === "CRITICAL") return `<span class="badge badge-critical">CRITICAL</span>`;
  if (level === "HIGH")     return `<span class="badge badge-high">HIGH</span>`;
  if (level === "MEDIUM")   return `<span class="badge badge-medium">MEDIUM</span>`;
  return `<span class="badge badge-low">ALERT</span>`;
}

function pad(n) { return String(n).padStart(2, "0"); }

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function generateHistory(sensor, hours = 24) {
  const base = sensor.value;
  const out = [];
  const now = Date.now();
  for (let i = hours; i >= 0; i--) {
    const noise = (Math.random() - 0.5) * Math.abs(base) * 0.06;
    const trend = sensor.status === "ALERT" ? (hours - i) * (Math.abs(base) * 0.001) : 0;
    out.push({
      t: new Date(now - i * 3_600_000),
      v: Math.round((base - trend + noise) * 100) / 100
    });
  }
  return out;
}

// ─────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────
function startClock() {
  const el = document.getElementById("timeClock");
  function tick() {
    const d = new Date();
    el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} | ${d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}`;
  }
  tick(); setInterval(tick, 1000);
}

// ─────────────────────────────────────────────
// MINI CANVAS CHART LIBRARY (no external deps)
// ─────────────────────────────────────────────
function drawLineChart(canvasId, datasets, labels, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.offsetWidth || 500;
  const H = opts.height || 220;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const PAD = { top: 16, right: 24, bottom: 36, left: 54 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  // Grid
  ctx.strokeStyle = "#30363d"; ctx.lineWidth = 1;
  const ySteps = 5;
  let allVals = datasets.flatMap(d => d.data);
  let minV = Math.min(...allVals), maxV = Math.max(...allVals);
  if (minV === maxV) { minV -= 1; maxV += 1; }
  const vRange = maxV - minV;

  for (let i = 0; i <= ySteps; i++) {
    const y = PAD.top + cH - (i / ySteps) * cH;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    const val = minV + (i / ySteps) * vRange;
    ctx.fillStyle = "#8b949e"; ctx.font = "11px system-ui"; ctx.textAlign = "right";
    ctx.fillText(Math.round(val * 10) / 10, PAD.left - 6, y + 4);
  }

  // X labels
  const step = Math.ceil(labels.length / 8);
  ctx.fillStyle = "#8b949e"; ctx.font = "10px system-ui"; ctx.textAlign = "center";
  labels.forEach((l, i) => {
    if (i % step === 0) {
      const x = PAD.left + (i / (labels.length - 1)) * cW;
      ctx.fillText(l, x, H - 8);
    }
  });

  // Lines
  datasets.forEach(ds => {
    const pts = ds.data.map((v, i) => ({
      x: PAD.left + (i / (ds.data.length - 1)) * cW,
      y: PAD.top + cH - ((v - minV) / vRange) * cH
    }));

    // Fill
    if (ds.fill) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, PAD.top + cH);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, PAD.top + cH);
      ctx.closePath();
      ctx.fillStyle = ds.fillColor || "rgba(59,130,246,0.08)";
      ctx.fill();
    }

    // Line
    ctx.beginPath();
    ctx.strokeStyle = ds.color || "#3b82f6";
    ctx.lineWidth = ds.lineWidth || 2;
    ctx.lineJoin = "round";
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Dots (last point)
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = ds.color || "#3b82f6"; ctx.fill();
  });
}

function drawBarChart(canvasId, labels, data, colors, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.offsetWidth || 500;
  const H = opts.height || 240;
  canvas.width = W; canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const PAD = { top: 16, right: 20, bottom: 48, left: 54 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const maxV = Math.max(...data) * 1.1 || 1;
  const barW = Math.min(48, (cW / data.length) * 0.6);

  // Y grid
  for (let i = 0; i <= 5; i++) {
    const y = PAD.top + cH - (i / 5) * cH;
    ctx.strokeStyle = "#30363d"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    ctx.fillStyle = "#8b949e"; ctx.font = "11px system-ui"; ctx.textAlign = "right";
    ctx.fillText(Math.round((i / 5) * maxV), PAD.left - 6, y + 4);
  }

  data.forEach((v, i) => {
    const x = PAD.left + (i / data.length) * cW + ((cW / data.length) - barW) / 2;
    const barH = (v / maxV) * cH;
    const y = PAD.top + cH - barH;
    ctx.fillStyle = colors[i] || "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();
    // value label
    ctx.fillStyle = "#e6edf3"; ctx.font = "bold 12px system-ui"; ctx.textAlign = "center";
    ctx.fillText(v, x + barW / 2, y - 6);
    // x label
    ctx.fillStyle = "#8b949e"; ctx.font = "11px system-ui";
    ctx.fillText(labels[i], x + barW / 2, H - 10);
  });
}

function drawRadarChart(canvasId, labels, values, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.offsetWidth || 320; const H = opts.height || 280;
  canvas.width = W; canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 40;
  const n = labels.length;
  const angle = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;

  // Grid circles
  for (let r = 1; r <= 5; r++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = angle(i); const rr = R * r / 5;
      ctx[i === 0 ? "moveTo" : "lineTo"](cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
    ctx.closePath();
    ctx.strokeStyle = "#30363d"; ctx.lineWidth = 1; ctx.stroke();
  }

  // Axes
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(angle(i)), cy + R * Math.sin(angle(i)));
    ctx.strokeStyle = "#484f58"; ctx.stroke();
    // Label
    const lx = cx + (R + 22) * Math.cos(angle(i));
    const ly = cy + (R + 22) * Math.sin(angle(i));
    ctx.fillStyle = "#8b949e"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(labels[i], lx, ly + 4);
  }

  // Data polygon
  ctx.beginPath();
  values.forEach((v, i) => {
    const rr = R * Math.min(v, 100) / 100;
    const p = { x: cx + rr * Math.cos(angle(i)), y: cy + rr * Math.sin(angle(i)) };
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(59,130,246,0.2)"; ctx.fill();
  ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 2; ctx.stroke();
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
function renderDashboard() {
  const b = getBridge();
  const alerts = b.sensors.filter(s => s.status !== "OK");

  // Alert badge
  document.getElementById("alertBadge").textContent = `${alerts.length} Alert${alerts.length !== 1 ? "s" : ""}`;
  document.getElementById("alertCount").textContent = alerts.length;

  // KPI cards
  const scoreColor = b.overall_health_score >= 75 ? "green" : b.overall_health_score >= 50 ? "yellow" : "red";
  const statusColor = { OPERATIONAL: "green", RESTRICTED: "yellow", CRITICAL: "red", CLOSED: "red" }[b.operational_status] || "blue";
  const critCount = b.sensors.filter(s => s.alert_level === "CRITICAL").length;
  const highCount = b.sensors.filter(s => s.alert_level === "HIGH").length;

  document.getElementById("kpiGrid").innerHTML = `
    <div class="kpi-card ${scoreColor}">
      <div class="kpi-icon">🩺</div>
      <div class="kpi-label">Health Score</div>
      <div class="kpi-value">${b.overall_health_score}</div>
      <div class="kpi-sub">out of 100</div>
    </div>
    <div class="kpi-card ${statusColor}">
      <div class="kpi-icon">🚦</div>
      <div class="kpi-label">Operational Status</div>
      <div class="kpi-value" style="font-size:16px;margin-top:4px">${b.operational_status}</div>
      <div class="kpi-sub">${b.type}</div>
    </div>
    <div class="kpi-card ${critCount > 0 ? "red" : "green"}">
      <div class="kpi-icon">🚨</div>
      <div class="kpi-label">Critical Alerts</div>
      <div class="kpi-value">${critCount}</div>
      <div class="kpi-sub">${highCount} HIGH</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-icon">📡</div>
      <div class="kpi-label">Active Sensors</div>
      <div class="kpi-value">${b.sensors.length}</div>
      <div class="kpi-sub">${b.sensors.filter(s => s.status === "OK").length} nominal</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-icon">📅</div>
      <div class="kpi-label">Bridge Age</div>
      <div class="kpi-value">${new Date().getFullYear() - b.year_built}</div>
      <div class="kpi-sub">years (built ${b.year_built})</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-icon">🏗️</div>
      <div class="kpi-label">Main Span</div>
      <div class="kpi-value">${b.span_m}</div>
      <div class="kpi-sub">metres</div>
    </div>
  `;

  // Chart sensor selector
  const sel = document.getElementById("chartSensorSelect");
  sel.innerHTML = b.sensors.map(s => `<option value="${s.sensor_id}">${s.sensor_id}</option>`).join("");
  if (!chartSensor || !b.sensors.find(s => s.sensor_id === chartSensor)) chartSensor = b.sensors[0].sensor_id;
  sel.value = chartSensor;

  drawSensorChart();
  drawHealthChart();
  renderAlertsTable();
}

function drawSensorChart() {
  const b = getBridge();
  const sensor = b.sensors.find(s => s.sensor_id === chartSensor) || b.sensors[0];
  const hist = generateHistory(sensor, 24);
  const labels = hist.map((h, i) => i % 4 === 0 ? `${pad(h.t.getHours())}:00` : "");
  const color = sensor.status === "ALERT" ? severityColor(sensor.alert_level) : "#3b82f6";
  drawLineChart("sensorChart", [{
    data: hist.map(h => h.v), color, fill: true,
    fillColor: `${color}18`, lineWidth: 2
  }], labels, { height: 220 });
}

function drawHealthChart() {
  const b = getBridge();
  const pts = [];
  const base = b.overall_health_score;
  for (let i = 29; i >= 0; i--) {
    const noise = (Math.random() - 0.5) * 4;
    const drift = -(29 - i) * 0.08;
    pts.push(Math.min(100, Math.max(0, Math.round(base - drift + noise))));
  }
  const labels = Array.from({ length: 30 }, (_, i) => i % 7 === 0 ? `-${30 - i}d` : "");
  drawLineChart("healthChart", [{
    data: pts, color: "#22c55e", fill: true,
    fillColor: "rgba(34,197,94,0.08)", lineWidth: 2
  }], labels, { height: 220 });
}

function renderAlertsTable() {
  const b = getBridge();
  const alerts = b.sensors.filter(s => s.status !== "OK");
  const tbody = document.getElementById("alertsBody");
  if (!alerts.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#8b949e;padding:24px">✅ No active alerts</td></tr>`;
    return;
  }
  tbody.innerHTML = alerts.map(s => `
    <tr>
      <td>${statusBadge(s.status, s.alert_level)}</td>
      <td><code style="font-size:11px;color:#8b949e">${s.sensor_id}</code></td>
      <td>${s.location}</td>
      <td><strong>${s.value}</strong> <span style="color:#8b949e;font-size:12px">${s.unit}</span></td>
      <td style="color:#8b949e;font-size:12px">${timestamp()}</td>
      <td><button class="btn-sm" onclick="navTo('sensors')">Inspect</button></td>
    </tr>
  `).join("");
}

// ─────────────────────────────────────────────
// SENSOR PAGE
// ─────────────────────────────────────────────
function renderSensors() {
  const b = getBridge();
  const filtered = sensorFilter === "all" ? b.sensors : b.sensors.filter(s => s.sensor_type === sensorFilter);
  const grid = document.getElementById("sensorGrid");
  grid.innerHTML = filtered.map(s => {
    const pct = s.design_limit
      ? Math.min(100, Math.abs(s.value / s.design_limit) * 100) : 50;
    const barColor = pct >= 90 ? "#ef4444" : pct >= 75 ? "#f97316" : pct >= 55 ? "#f59e0b" : "#22c55e";
    const cardClass = s.alert_level === "CRITICAL" ? "alert-critical" : s.alert_level === "HIGH" ? "alert-high" : s.alert_level === "MEDIUM" ? "alert-medium" : "";
    return `
      <div class="sensor-card ${cardClass}">
        <div class="sensor-top">
          <div>
            <div class="sensor-id">${s.sensor_id}</div>
            <div class="sensor-name">${capitalize(s.sensor_type)} Sensor</div>
          </div>
          ${statusBadge(s.status, s.alert_level)}
        </div>
        <div class="sensor-loc">📍 ${s.location}</div>
        <div class="sensor-value-row">
          <div class="sensor-value">${s.value}</div>
          <div class="sensor-unit">${s.unit}</div>
        </div>
        <div class="sensor-bar-wrap">
          <div class="sensor-bar" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:#8b949e">
          <span>${pct.toFixed(1)}% of limit</span>
          <span>Limit: ${s.design_limit} ${s.unit}</span>
        </div>
      </div>
    `;
  }).join("");
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─────────────────────────────────────────────
// ANOMALY DETECTION
// ─────────────────────────────────────────────
function runAnomalyDetection() {
  const b = getBridge();
  const threshold = parseFloat(document.getElementById("zThresh").value);

  // Group by type, compute Z-scores
  const groups = {};
  b.sensors.forEach(s => {
    if (!groups[s.sensor_type]) groups[s.sensor_type] = [];
    groups[s.sensor_type].push(s);
  });

  const anomalies = [];
  Object.entries(groups).forEach(([, sensors]) => {
    if (sensors.length < 2) return;
    const vals = sensors.map(s => s.value);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.map(v => (v - mean) ** 2).reduce((a, b) => a + b, 0) / vals.length);
    if (std === 0) return;
    sensors.forEach(s => {
      const z = Math.abs((s.value - mean) / std);
      if (z >= threshold) anomalies.push({ ...s, z_score: Math.round(z * 100) / 100, type: z >= 4 ? "EXTREME_OUTLIER" : "STATISTICAL_ANOMALY" });
    });
  });

  // Chart — Z-scores for all sensors
  const labels = b.sensors.map(s => s.sensor_id.split("-").slice(0, 2).join("-"));
  const zScores = b.sensors.map(s => {
    const grp = groups[s.sensor_type];
    if (!grp || grp.length < 2) return 0;
    const vals = grp.map(x => x.value);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.map(v => (v - mean) ** 2).reduce((a, b) => a + b, 0) / vals.length);
    return std === 0 ? 0 : Math.round(Math.abs((s.value - mean) / std) * 100) / 100;
  });
  const colors = zScores.map(z => z >= 4 ? "#ef4444" : z >= threshold ? "#f97316" : "#3b82f6");

  setTimeout(() => drawBarChart("anomalyChart", labels, zScores, colors, { height: 260 }), 50);

  const resultsEl = document.getElementById("anomalyResults");
  if (!anomalies.length) {
    resultsEl.innerHTML = `<div style="color:#22c55e;padding:12px;font-size:13px">✅ No anomalies detected at Z-score threshold ${threshold}</div>`;
    return;
  }
  resultsEl.innerHTML = anomalies.map(a => `
    <div class="anomaly-card ${a.type === "EXTREME_OUTLIER" ? "extreme" : ""}">
      <div class="anomaly-title">${a.sensor_id}</div>
      <div class="anomaly-meta">📍 ${a.location} &nbsp;|&nbsp; Value: <strong>${a.value} ${a.unit}</strong></div>
      <div class="anomaly-meta" style="margin-top:4px">Z-Score: <strong style="color:${a.type==="EXTREME_OUTLIER"?"#ef4444":"#f97316"}">${a.z_score}</strong> &nbsp;|&nbsp; Type: ${a.type}</div>
    </div>
  `).join("");
}

// ─────────────────────────────────────────────
// PREDICTIVE MODEL
// ─────────────────────────────────────────────
function runPredictiveModel() {
  const b = getBridge();
  const component = document.getElementById("componentSelect").value;
  const modelType = document.getElementById("modelTypeSelect").value;
  const loadCycles = parseInt(document.getElementById("loadCycles").value) || 5000;
  const age = new Date().getFullYear() - b.year_built;

  let rul, confidence, notes;

  if (modelType === "fatigue") {
    const designLife = 75;
    const fatigueConsumed = (age * loadCycles * 365) / (50 * 5000 * 365);
    const remaining = Math.max(0, 1 - fatigueConsumed);
    rul = Math.round(remaining * designLife);
    confidence = remaining > 0.5 ? "HIGH" : remaining > 0.2 ? "MEDIUM" : "LOW";
    notes = `Paris-law model. ${(fatigueConsumed * 100).toFixed(1)}% fatigue consumed. Design life: 75 yrs. Load cycles: ${loadCycles.toLocaleString()}/day.`;
  } else if (modelType === "corrosion") {
    const corrSensor = b.sensors.find(s => s.sensor_type === "corrosion");
    const mV = corrSensor ? corrSensor.value : -300;
    const rate = mV < -500 ? 0.25 : mV < -350 ? 0.12 : 0.04;
    const cover = 40, minCover = 15;
    const remaining = cover - age * rate;
    rul = Math.max(0, Math.round((remaining - minCover) / rate));
    confidence = rul > 20 ? "HIGH" : rul > 5 ? "MEDIUM" : "LOW";
    notes = `Faraday corrosion model. Rate: ${rate} mm/yr. Cover remaining: ${remaining.toFixed(1)} mm. Min threshold: ${minCover} mm.`;
  } else {
    const dispSensor = b.sensors.find(s => s.sensor_type === "displacement");
    const curr = dispSensor ? dispSensor.value : 15;
    const maxAllowable = b.span_m / 360;
    const rate = curr / age;
    rul = Math.max(0, Math.round((maxAllowable - curr) / rate));
    confidence = rul > 20 ? "HIGH" : rul > 5 ? "MEDIUM" : "LOW";
    notes = `Linear settlement model. Rate: ${rate.toFixed(2)} mm/yr. Current: ${curr} mm. L/360 limit: ${maxAllowable.toFixed(1)} mm.`;
  }

  const confColor = confidence === "HIGH" ? "#22c55e" : confidence === "MEDIUM" ? "#f59e0b" : "#ef4444";
  const rec = rul <= 5 ? "⚠️ CRITICAL: Urgent structural assessment required."
    : rul <= 15 ? "🔴 HIGH: Include in next capital maintenance programme."
    : rul <= 30 ? "🟡 MEDIUM: Monitor closely; plan preventive maintenance."
    : "🟢 LOW: Continue routine monitoring.";

  const el = document.getElementById("modelResults");
  el.innerHTML = `
    <div class="rul-card" style="grid-column: 1 / -1">
      <div class="rul-title">${capitalize(modelType)} Model — ${capitalize(component)}</div>
      <div style="display:flex;align-items:baseline;gap:12px">
        <div class="rul-value ${confidence.toLowerCase()}">${rul}</div>
        <div class="rul-label">years remaining useful life</div>
      </div>
      <div class="rul-bar-wrap">
        <div class="rul-bar" style="width:${Math.min(100, rul/75*100)}%;background:${confColor}"></div>
      </div>
      <div style="display:flex;gap:16px;font-size:12px;color:#8b949e;margin-top:6px">
        <span>Confidence: <strong style="color:${confColor}">${confidence}</strong></span>
        <span>Bridge Age: ${age} yrs</span>
        <span>Component: ${capitalize(component)}</span>
      </div>
      <div class="rul-notes">${notes}</div>
      <div style="background:var(--surface2);border-radius:6px;padding:12px;font-size:13px">${rec}</div>
    </div>
  `;

  // Run all 3 models for comparison chart
  const allModels = ["fatigue", "corrosion", "settlement"];
  const allRUL = allModels.map(m => {
    if (m === "fatigue") {
      const fc = (age * loadCycles * 365) / (50 * 5000 * 365);
      return Math.round(Math.max(0, 1 - fc) * 75);
    } else if (m === "corrosion") {
      const mV = (b.sensors.find(s => s.sensor_type === "corrosion") || {}).value || -300;
      const rate = mV < -500 ? 0.25 : mV < -350 ? 0.12 : 0.04;
      return Math.max(0, Math.round((40 - age * rate - 15) / rate));
    } else {
      const curr = (b.sensors.find(s => s.sensor_type === "displacement") || {}).value || 15;
      return Math.max(0, Math.round((b.span_m / 360 - curr) / (curr / age)));
    }
  });

  document.getElementById("rulChartCard").style.display = "block";
  setTimeout(() => drawBarChart("rulChart", ["Fatigue", "Corrosion", "Settlement"], allRUL, ["#3b82f6", "#f97316", "#a855f7"], { height: 240 }), 60);
}

// ─────────────────────────────────────────────
// MAINTENANCE PLAN
// ─────────────────────────────────────────────
function generateMaintenancePlan() {
  const b = getBridge();
  const includeCost = document.getElementById("costEstimate").checked;
  const age = new Date().getFullYear() - b.year_built;

  const recs = [];

  b.sensors.forEach(s => {
    if (s.status === "FAULT" || s.status === "OFFLINE") {
      recs.push({ priority: "MEDIUM", component: `Sensor ${s.sensor_id}`, finding: `Sensor ${s.status} at ${s.location}`, action: "Inspect, repair or replace sensor unit", due_in: "Within 14 days", std: "SHM maintenance protocol", cost: "$500–$2,000" });
    }
    if (s.alert_level === "CRITICAL") {
      recs.push({ priority: "CRITICAL", component: s.location, finding: `${capitalize(s.sensor_type)} reading ${s.value} ${s.unit} — CRITICAL threshold exceeded`, action: "Immediate inspection; consider traffic restriction or bridge closure", due_in: "Immediately", std: "AASHTO LRFD §1.3", cost: "$50,000–$500,000+" });
    } else if (s.alert_level === "HIGH") {
      const action = s.sensor_type === "corrosion" ? "Cathodic protection survey and patch repair" : s.sensor_type === "strain" ? "Fatigue assessment and load restriction" : "Targeted inspection and repair";
      recs.push({ priority: "HIGH", component: s.location, finding: `${capitalize(s.sensor_type)} alert: ${s.value} ${s.unit}`, action, due_in: "Within 7 days", std: "Eurocode EN 1337 / AASHTO", cost: "$5,000–$50,000" });
    } else if (s.alert_level === "MEDIUM") {
      recs.push({ priority: "MEDIUM", component: s.location, finding: `${capitalize(s.sensor_type)} reading ${s.value} ${s.unit} — monitoring elevated`, action: "Schedule inspection and review baseline", due_in: "Within 30 days", std: "ISO 13822", cost: "$1,000–$10,000" });
    }
  });

  if (age > 30) {
    recs.push({ priority: "MEDIUM", component: "Full bridge", finding: `Bridge is ${age} years old — principal inspection due`, action: "Commission principal inspection per AASHTO MBE §5", due_in: "Within 30 days", std: "AASHTO MBE §5", cost: "$15,000–$80,000" });
  }

  recs.push({ priority: "LOW", component: "All sensors", finding: "Routine calibration window", action: "Annual sensor calibration and data logger firmware update", due_in: "Next inspection cycle", std: "IEEE 1451", cost: "$2,000–$8,000" });

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  recs.sort((a, b) => order[a.priority] - order[b.priority]);

  const grouped = {};
  recs.forEach(r => { if (!grouped[r.priority]) grouped[r.priority] = []; grouped[r.priority].push(r); });

  let html = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">`;
  ["CRITICAL", "HIGH", "MEDIUM", "LOW"].forEach(p => {
    const c = (grouped[p] || []).length;
    const col = p === "CRITICAL" ? "#ef4444" : p === "HIGH" ? "#f97316" : p === "MEDIUM" ? "#f59e0b" : "#22c55e";
    html += `<div style="background:${col}18;border:1px solid ${col}40;border-radius:8px;padding:12px 20px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${col}">${c}</div>
      <div style="font-size:11px;color:#8b949e;text-transform:uppercase;margin-top:2px">${p}</div>
    </div>`;
  });
  html += `</div>`;

  ["CRITICAL", "HIGH", "MEDIUM", "LOW"].forEach(p => {
    if (!grouped[p] || !grouped[p].length) return;
    html += `
      <div class="maint-priority-section">
        <div class="maint-priority-header ${p.toLowerCase()}">
          ${p === "CRITICAL" ? "🚨" : p === "HIGH" ? "🔴" : p === "MEDIUM" ? "🟡" : "🟢"} ${p} PRIORITY — ${grouped[p].length} action${grouped[p].length > 1 ? "s" : ""}
        </div>
        <div class="maint-items">
          ${grouped[p].map(r => `
            <div class="maint-item">
              <div class="maint-item-title">${r.component}</div>
              <div class="maint-item-detail">🔎 ${r.finding}</div>
              <div class="maint-item-detail">🔧 ${r.action}</div>
              <div class="maint-item-footer">
                <span class="maint-due">📅 ${r.due_in}</span>
                <span class="maint-std">📘 ${r.std}</span>
                ${includeCost ? `<span class="maint-cost">💰 ${r.cost}</span>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  });

  document.getElementById("maintenanceResults").innerHTML = html;
}

// ─────────────────────────────────────────────
// CONDITION REPORT
// ─────────────────────────────────────────────
function generateReport() {
  const b = getBridge();
  const age = new Date().getFullYear() - b.year_built;
  const alerts = b.sensors.filter(s => s.status !== "OK");
  const critAlerts = b.sensors.filter(s => s.alert_level === "CRITICAL");
  const highAlerts = b.sensors.filter(s => s.alert_level === "HIGH");
  const scoreClass = b.overall_health_score >= 75 ? "good" : b.overall_health_score >= 50 ? "warn" : "danger";

  const compAssessments = [
    { name: "Deck", s: b.sensors.find(s => s.sensor_type === "strain"), icon: "🏗️" },
    { name: "Foundation/Pier", s: b.sensors.find(s => s.sensor_type === "displacement"), icon: "⬇️" },
    { name: "Bearings", s: b.sensors.find(s => s.sensor_type === "vibration"), icon: "🔩" },
    { name: "Rebar/Steel", s: b.sensors.find(s => s.sensor_type === "corrosion"), icon: "🧪" },
  ].filter(c => c.s);

  let html = `
    <div class="score-header">
      <div class="score-circle ${scoreClass}">${b.overall_health_score}</div>
      <div>
        <h2 style="border:none;margin:0;padding:0">Bridge Condition Report</h2>
        <p style="color:#8b949e;margin:0;font-size:13px">Generated: ${timestamp()} &nbsp;|&nbsp; ARIA v1.0</p>
        <p style="margin:6px 0 0"><span class="badge badge-${b.operational_status === "OPERATIONAL" ? "ok" : b.operational_status === "RESTRICTED" ? "medium" : "critical"}">${b.operational_status}</span></p>
      </div>
    </div>

    <div class="report-meta">
      <div class="meta-row"><span class="meta-label">Bridge ID: </span><span class="meta-val">${b.id}</span></div>
      <div class="meta-row"><span class="meta-label">Name: </span><span class="meta-val">${b.name}</span></div>
      <div class="meta-row"><span class="meta-label">Type: </span><span class="meta-val">${b.type}</span></div>
      <div class="meta-row"><span class="meta-label">Location: </span><span class="meta-val">${b.location}</span></div>
      <div class="meta-row"><span class="meta-label">Year Built: </span><span class="meta-val">${b.year_built} (Age: ${age} yrs)</span></div>
      <div class="meta-row"><span class="meta-label">Main Span: </span><span class="meta-val">${b.span_m} m</span></div>
      <div class="meta-row"><span class="meta-label">Design Load: </span><span class="meta-val">${b.design_load_kN.toLocaleString()} kN</span></div>
      <div class="meta-row"><span class="meta-label">Last Inspection: </span><span class="meta-val">${b.last_inspection}</span></div>
    </div>

    <h2>Executive Summary</h2>
    <p>${b.name} (${b.id}) is currently <strong>${b.operational_status}</strong> with an overall health score of <strong>${b.overall_health_score}/100</strong>. 
    The monitoring network has detected <strong>${alerts.length} active alert(s)</strong>, of which ${critAlerts.length} are CRITICAL and ${highAlerts.length} are HIGH severity. 
    Immediate engineering review is ${critAlerts.length > 0 ? "REQUIRED" : highAlerts.length > 0 ? "strongly recommended" : "not currently required but should be scheduled routinely"}.
    The bridge has been in service for ${age} years, placing it in the ${age > 50 ? "late-life ageing" : age > 30 ? "mid-life" : "early operational"} phase.</p>

    ${critAlerts.length > 0 ? `<h2>⚠️ Critical Findings</h2>${critAlerts.map(s => `<div class="critical-box"><strong>${s.location}</strong> — ${capitalize(s.sensor_type)} reading of <strong>${s.value} ${s.unit}</strong> exceeds design threshold. Immediate action required per AASHTO LRFD §1.3.</div>`).join("")}` : ""}
    ${highAlerts.length > 0 ? `<h2>🔴 High-Severity Findings</h2>${highAlerts.map(s => `<div class="high-box"><strong>${s.location}</strong> — ${capitalize(s.sensor_type)} alert: ${s.value} ${s.unit}. Schedule inspection within 7 days.</div>`).join("")}` : ""}

    <h2>Component-Level Assessment</h2>
    ${compAssessments.map(c => {
      const pct = c.s.design_limit ? Math.min(100, Math.abs(c.s.value / c.s.design_limit) * 100) : 50;
      const cond = pct >= 90 ? "Poor" : pct >= 70 ? "Fair" : "Good";
      return `<h3>${c.icon} ${c.name}</h3>
      <p>Current reading: <strong>${c.s.value} ${c.s.unit}</strong> at ${c.s.location} (${pct.toFixed(1)}% of design limit). 
      Condition: <strong>${cond}</strong>. Status: ${statusBadge(c.s.status, c.s.alert_level)}</p>`;
    }).join("")}

    <h2>Predictive Analysis</h2>
    <p>Based on current degradation trends and sensor data, ARIA estimates the following remaining useful life for key components:</p>
    <ul>
      <li><strong>Structural Fatigue (deck/girder):</strong> Approximately ${Math.max(0, Math.round((1 - (age * 5000 * 365) / (50 * 5000 * 365)) * 75))} years at current traffic loading</li>
      <li><strong>Reinforcement Corrosion:</strong> Subject to electrochemical potential trends; active monitoring is recommended</li>
      <li><strong>Overall Service Life:</strong> The bridge is currently at ${Math.round((age / 75) * 100)}% of typical design service life</li>
    </ul>

    <h2>Recommended Actions</h2>
    <ul>
      ${critAlerts.length > 0 ? `<li>🚨 <strong>CRITICAL:</strong> Immediately restrict heavy vehicle access and commission emergency structural inspection</li>` : ""}
      ${highAlerts.length > 0 ? `<li>🔴 <strong>HIGH:</strong> Schedule detailed NDT inspection within 7 days for all HIGH-alert sensor zones</li>` : ""}
      <li>🟡 Continue enhanced monitoring frequency (24-hour continuous logging)</li>
      <li>📊 Commission principal inspection per AASHTO MBE §5 (${age > 30 ? "OVERDUE — age threshold exceeded" : "due within scheduled programme"})</li>
      <li>🔧 Review bearing condition and alignment at all piers</li>
      <li>📡 Replace or service any FAULT/OFFLINE sensors within 14 days</li>
    </ul>

    <h2>Standards Applied</h2>
    <ul>
      <li>AASHTO LRFD Bridge Design Specifications, 9th Edition</li>
      <li>AASHTO Manual for Bridge Evaluation (MBE), 3rd Edition</li>
      <li>Eurocode EN 1337 — Structural Bearings</li>
      <li>BS 5400 — Steel, Concrete and Composite Bridges</li>
      <li>ISO 13822 — Assessment of Existing Structures</li>
    </ul>
    <p style="font-size:12px;color:#484f58;margin-top:24px;border-top:1px solid #30363d;padding-top:12px">
      Report generated by ARIA (Autonomous Real-time Infrastructure Analyst) integrated with Bob AI platform. 
      This report is computer-generated and should be reviewed by a qualified structural engineer before any bridge operations decisions are made.
    </p>
  `;

  document.getElementById("reportOutput").innerHTML = html;
}

// ─────────────────────────────────────────────
// AI ASSISTANT
// ─────────────────────────────────────────────
const ARIA_RESPONSES = {
  sensor: () => {
    const b = getBridge();
    const alerts = b.sensors.filter(s => s.status !== "OK");
    return `I've analysed all <strong>${b.sensors.length} sensors</strong> on <strong>${b.name}</strong>.\n\n<ul>
      <li>🟢 <strong>${b.sensors.filter(s=>s.status==="OK").length} sensors</strong> are nominal</li>
      <li>⚠️ <strong>${alerts.length} sensors</strong> are in alert state</li>
      ${alerts.map(a => `<li>${statusBadge(a.status, a.alert_level)} <code>${a.sensor_id}</code> — ${a.value} ${a.unit} at ${a.location}</li>`).join("")}
    </ul>\nOverall health score: <strong>${b.overall_health_score}/100</strong>.`;
  },
  rul: () => {
    const b = getBridge();
    const age = new Date().getFullYear() - b.year_built;
    const fc = (age * 5000 * 365) / (50 * 5000 * 365);
    const rulFatigue = Math.round(Math.max(0, 1-fc) * 75);
    const mV = (b.sensors.find(s=>s.sensor_type==="corrosion")||{}).value || -300;
    const rate = mV < -500 ? 0.25 : mV < -350 ? 0.12 : 0.04;
    const rulCorr = Math.max(0, Math.round((40 - age*rate - 15)/rate));
    return `Predicted <strong>Remaining Useful Life (RUL)</strong> for <strong>${b.name}</strong>:\n<ul>
      <li>🔩 <strong>Fatigue (Paris-law):</strong> ~${rulFatigue} years — ${rulFatigue<10?"⚠️ Action required soon":rulFatigue<25?"🟡 Monitor closely":"🟢 Good margin"}</li>
      <li>🧪 <strong>Corrosion (Faraday):</strong> ~${rulCorr} years at current corrosion rate of ${rate} mm/yr</li>
      <li>⬇️ <strong>Settlement:</strong> Estimated at <30 years based on displacement trends</li>
    </ul>\nRecommendation: ${rulFatigue<15||rulCorr<10?"<strong>Schedule detailed inspection within 30 days.</strong>":"Continue routine monitoring programme."}`;
  },
  priority: () => {
    const b = getBridge();
    const crit = b.sensors.filter(s=>s.alert_level==="CRITICAL");
    const high = b.sensors.filter(s=>s.alert_level==="HIGH");
    return `<strong>Top maintenance priorities for ${b.name}:</strong>\n<ul>
      ${crit.map(s=>`<li>🚨 <span class="badge badge-critical">CRITICAL</span> <strong>${s.location}</strong> — ${capitalize(s.sensor_type)}: ${s.value} ${s.unit}. Immediate action.</li>`).join("")}
      ${high.map(s=>`<li>🔴 <span class="badge badge-high">HIGH</span> <strong>${s.location}</strong> — ${capitalize(s.sensor_type)}: ${s.value} ${s.unit}. Action within 7 days.</li>`).join("")}
      <li>🟡 <span class="badge badge-medium">MEDIUM</span> Age-based principal inspection overdue (${new Date().getFullYear()-b.year_built} years in service)</li>
    </ul>`;
  },
  corrosion: () => {
    const b = getBridge();
    const s = b.sensors.find(x=>x.sensor_type==="corrosion");
    if (!s) return "No corrosion sensor data available for this bridge.";
    const risk = s.value < -500 ? "SEVERE" : s.value < -350 ? "ACTIVE" : s.value < -200 ? "PASSIVE" : "LOW";
    const rate = s.value < -500 ? 0.25 : s.value < -350 ? 0.12 : 0.04;
    return `<strong>Corrosion Analysis — ${b.name}</strong>\n\n
      Sensor <code>${s.sensor_id}</code> at <em>${s.location}</em> reads <strong>${s.value} ${s.unit}</strong>.\n\n
      <ul>
        <li>⚡ Half-cell potential: <strong>${s.value} mV (CSE)</strong></li>
        <li>🧪 Corrosion risk: <strong style="color:${s.value<-350?"#ef4444":"#22c55e"}">${risk}</strong></li>
        <li>📉 Estimated rebar corrosion rate: <strong>${rate} mm/year</strong></li>
        <li>🕐 Interpretation: ${s.value < -350 ? "Active corrosion detected. Immediate cathodic protection survey recommended. Refer ASTM C876." : "Passive state — continue monitoring quarterly."}</li>
      </ul>
      Standard reference: <em>ASTM C876 / BS 1881 Part 201</em>.`;
  },
  report: () => {
    const b = getBridge();
    return `Here is a summary condition report for <strong>${b.name}</strong>:\n\n
      <ul>
        <li>🩺 <strong>Overall Health Score:</strong> ${b.overall_health_score}/100</li>
        <li>🚦 <strong>Operational Status:</strong> ${b.operational_status}</li>
        <li>⚠️ <strong>Active Alerts:</strong> ${b.sensors.filter(s=>s.status!=="OK").length} (${b.sensors.filter(s=>s.alert_level==="CRITICAL").length} CRITICAL, ${b.sensors.filter(s=>s.alert_level==="HIGH").length} HIGH)</li>
        <li>📅 <strong>Last Inspection:</strong> ${b.last_inspection}</li>
        <li>🏗️ <strong>Bridge Age:</strong> ${new Date().getFullYear()-b.year_built} years</li>
      </ul>
      Navigate to the <strong>Condition Report</strong> page for the full report, or the <strong>Maintenance Plan</strong> page for prioritised actions.`;
  }
};

function getARIAResponse(query) {
  const q = query.toLowerCase();
  if (q.includes("sensor") || q.includes("analys") || q.includes("reading")) return ARIA_RESPONSES.sensor();
  if (q.includes("rul") || q.includes("remaining") || q.includes("life") || q.includes("predict")) return ARIA_RESPONSES.rul();
  if (q.includes("priorit") || q.includes("maintenance") || q.includes("repair")) return ARIA_RESPONSES.priority();
  if (q.includes("corrosion") || q.includes("rust") || q.includes("rebar")) return ARIA_RESPONSES.corrosion();
  if (q.includes("report") || q.includes("condition") || q.includes("summary")) return ARIA_RESPONSES.report();
  const b = getBridge();
  return `I'm analysing <strong>${b.name}</strong> (${b.id}). Health score: <strong>${b.overall_health_score}/100</strong>, status: <strong>${b.operational_status}</strong>. 
    Try asking me about: sensor readings, remaining useful life, corrosion risk, maintenance priorities, or a full condition report.`;
}

function appendMessage(role, html) {
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.innerHTML = role === "user"
    ? `<div class="chat-avatar">👤</div><div class="chat-bubble">${html}</div>`
    : `<div class="chat-avatar">🤖</div><div class="chat-bubble">${html}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = "chat-msg aria"; div.id = "typing-indicator";
  div.innerHTML = `<div class="chat-avatar">🤖</div><div class="chat-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  container.appendChild(div); container.scrollTop = container.scrollHeight;
}
function removeTyping() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

function sendChat(text) {
  if (!text.trim()) return;
  appendMessage("user", text);
  document.getElementById("chatInput").value = "";
  showTyping();
  setTimeout(() => {
    removeTyping();
    appendMessage("aria", getARIAResponse(text));
  }, 900 + Math.random() * 600);
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function navTo(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add("active");
  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add("active");
  currentPage = page;
  const names = { dashboard: "Dashboard", sensors: "Sensor Monitor", anomalies: "Anomaly Detection", predictive: "Predictive Model", maintenance: "Maintenance Plan", report: "Condition Report", ai: "AI Assistant" };
  document.getElementById("breadcrumb").textContent = names[page] || page;

  if (page === "dashboard") renderDashboard();
  else if (page === "sensors") renderSensors();
  else if (page === "anomalies") setTimeout(runAnomalyDetection, 100);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function init() {
  startClock();

  // Nav
  document.querySelectorAll(".nav-item").forEach(el => {
    el.addEventListener("click", e => { e.preventDefault(); navTo(el.dataset.page); document.getElementById("sidebar").classList.remove("open"); });
  });

  // Mobile menu
  document.getElementById("menuBtn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  // Bridge selector
  document.getElementById("bridgeSelect").addEventListener("change", e => {
    currentBridgeId = e.target.value;
    navTo(currentPage);
  });

  // Chart sensor selector
  document.getElementById("chartSensorSelect").addEventListener("change", e => {
    chartSensor = e.target.value;
    drawSensorChart();
  });

  // Anomaly controls
  document.getElementById("zThresh").addEventListener("input", e => {
    document.getElementById("zThreshVal").textContent = e.target.value;
  });
  document.getElementById("runAnomalyBtn").addEventListener("click", runAnomalyDetection);

  // Filter buttons
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      sensorFilter = btn.dataset.type;
      renderSensors();
    });
  });

  // Predictive model
  document.getElementById("runModelBtn").addEventListener("click", runPredictiveModel);

  // Maintenance
  document.getElementById("genMaintenanceBtn").addEventListener("click", generateMaintenancePlan);

  // Report
  document.getElementById("genReportBtn").addEventListener("click", generateReport);
  document.getElementById("printReportBtn").addEventListener("click", () => window.print());

  // AI chat
  document.getElementById("chatSend").addEventListener("click", () => sendChat(document.getElementById("chatInput").value));
  document.getElementById("chatInput").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(e.target.value); });
  document.querySelectorAll(".qbtn").forEach(btn => btn.addEventListener("click", () => sendChat(btn.dataset.q)));

  // Initial ARIA greeting
  setTimeout(() => {
    appendMessage("aria", `Hello! I'm <strong>ARIA</strong> — Autonomous Real-time Infrastructure Analyst. I'm monitoring <strong>${getBridge().name}</strong> right now. 
      Current health score: <strong>${getBridge().overall_health_score}/100</strong> &nbsp;|&nbsp; Status: <strong>${getBridge().operational_status}</strong>.<br><br>
      I've detected <strong>${getBridge().sensors.filter(s=>s.status!=="OK").length} active alert(s)</strong>. How can I help you today?`);
  }, 500);

  // Initial page
  renderDashboard();

  // Live simulation — update one sensor value every 8 seconds
  setInterval(() => {
    const b = getBridge();
    const s = b.sensors[Math.floor(Math.random() * b.sensors.length)];
    const delta = (Math.random() - 0.5) * Math.abs(s.value) * 0.03;
    s.value = Math.round((s.value + delta) * 100) / 100;
    if (currentPage === "dashboard") {
      drawSensorChart();
      renderAlertsTable();
    } else if (currentPage === "sensors") {
      renderSensors();
    }
  }, 8000);
}

document.addEventListener("DOMContentLoaded", init);
