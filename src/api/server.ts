/**
 * ARIA Bridge Health Monitoring — HTTP API Server
 * Wraps the MCP tool handlers as plain HTTP endpoints.
 * Zero external runtime deps beyond Node's built-in `http` module.
 *
 * Endpoints
 * ---------
 *  POST /api/sensor-reading        analyseSensorReading
 *  POST /api/structural-health     calculateStructuralHealth
 *  POST /api/alert-threshold       checkAlertThresholds
 *  POST /api/maintenance-schedule  generateMaintenanceSchedule
 *  POST /api/anomaly-detect        detectAnomalies
 *  POST /api/rul                   predictRUL
 *  GET  /api/bridge-registry       getBridgeRegistry
 *  GET  /health                    liveness probe
 *  GET  /                          API index
 */

import http from "http";
import { URL } from "url";

// ─── Type helpers ────────────────────────────────────────────────────────────

interface SensorReading {
  bridgeId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp?: string;
}

interface HealthRequest {
  bridgeId: string;
  readings: SensorReading[];
}

interface MaintenanceRequest {
  bridgeId: string;
  healthScore: number;
  lastInspection: string;
  criticalSensors?: string[];
}

interface AnomalyRequest {
  bridgeId: string;
  sensorType: string;
  values: number[];
  timestamps?: string[];
  sensitivity?: "low" | "medium" | "high";
}

interface RULRequest {
  bridgeId: string;
  deteriorationModel: "fatigue" | "corrosion" | "settlement";
  currentValue: number;
  historicalRate?: number;
  threshold?: number;
}

// ─── Bridge registry (static seed — matches MCP server) ──────────────────────

const BRIDGE_REGISTRY: Record<string, {
  name: string; location: string; yearBuilt: number;
  type: string; span: number; maxLoad: number;
}> = {
  "BRG-001": { name: "Golden Gate Replica", location: "San Francisco, CA", yearBuilt: 1937, type: "suspension",   span: 1280, maxLoad: 4000 },
  "BRG-002": { name: "Harbor Crossing",     location: "New York, NY",       yearBuilt: 1965, type: "cable-stayed", span:  420, maxLoad: 2500 },
  "BRG-003": { name: "River Valley Bridge", location: "Portland, OR",       yearBuilt: 1989, type: "beam",         span:   85, maxLoad: 1800 },
  "BRG-004": { name: "Mountain Pass Span",  location: "Denver, CO",         yearBuilt: 2002, type: "arch",         span:  210, maxLoad: 3200 },
  "BRG-005": { name: "Coastal Connector",   location: "Miami, FL",          yearBuilt: 1978, type: "truss",        span:  340, maxLoad: 2200 },
};

// ─── Analysis helpers (mirrors MCP logic) ────────────────────────────────────

function analyseSensorReading(r: SensorReading): object {
  const thresholds: Record<string, { warning: number; critical: number }> = {
    vibration:   { warning: 0.8,  critical: 1.2  },
    strain:      { warning: 450,  critical: 600  },
    temperature: { warning: 60,   critical: 80   },
    displacement:{ warning: 25,   critical: 40   },
    corrosion:   { warning: 0.15, critical: 0.30 },
    load:        { warning: 3200, critical: 4000 },
  };

  const t = thresholds[r.sensorType.toLowerCase()];
  let status = "normal";
  let recommendation = "Continue routine monitoring.";

  if (t) {
    if (r.value >= t.critical) {
      status = "critical";
      recommendation = "Immediate inspection required. Consider load restriction.";
    } else if (r.value >= t.warning) {
      status = "warning";
      recommendation = "Schedule inspection within 30 days. Increase monitoring frequency.";
    }
  }

  return {
    bridgeId: r.bridgeId,
    sensorType: r.sensorType,
    value: r.value,
    unit: r.unit,
    status,
    recommendation,
    timestamp: r.timestamp ?? new Date().toISOString(),
    thresholds: t ?? null,
  };
}

function calculateStructuralHealth(req: HealthRequest): object {
  const weights: Record<string, number> = {
    vibration: 0.25, strain: 0.30, displacement: 0.20,
    corrosion: 0.15, temperature: 0.05, load: 0.05,
  };

  let weightedScore = 0;
  let totalWeight = 0;
  const sensorDetails: object[] = [];

  for (const reading of req.readings) {
    const analysis = analyseSensorReading(reading) as Record<string, unknown>;
    const w = weights[reading.sensorType.toLowerCase()] ?? 0.1;
    const score = analysis["status"] === "normal" ? 100
                : analysis["status"] === "warning" ? 60 : 20;
    weightedScore += score * w;
    totalWeight   += w;
    sensorDetails.push({ sensorType: reading.sensorType, status: analysis["status"], score });
  }

  const healthScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 75;
  const condition   = healthScore >= 80 ? "Good"
                    : healthScore >= 60 ? "Fair"
                    : healthScore >= 40 ? "Poor" : "Critical";

  return {
    bridgeId: req.bridgeId,
    overallHealthScore: healthScore,
    condition,
    sensorDetails,
    inspectionPriority: condition === "Critical" ? "Immediate" : condition === "Poor" ? "High" : "Routine",
    timestamp: new Date().toISOString(),
  };
}

function detectAnomalies(req: AnomalyRequest): object {
  const sensitivity = req.sensitivity ?? "medium";
  const zThreshold  = sensitivity === "low" ? 3.5 : sensitivity === "high" ? 2.0 : 2.5;

  const mean = req.values.reduce((a, b) => a + b, 0) / req.values.length;
  const std  = Math.sqrt(req.values.map(v => (v - mean) ** 2).reduce((a, b) => a + b, 0) / req.values.length);

  const anomalies = req.values
    .map((v, i) => ({ index: i, value: v, zScore: std > 0 ? Math.abs(v - mean) / std : 0,
                      timestamp: req.timestamps?.[i] ?? new Date(Date.now() - (req.values.length - i) * 60000).toISOString() }))
    .filter(a => a.zScore > zThreshold);

  return {
    bridgeId: req.bridgeId,
    sensorType: req.sensorType,
    totalReadings: req.values.length,
    anomaliesDetected: anomalies.length,
    anomalyRate: `${((anomalies.length / req.values.length) * 100).toFixed(1)}%`,
    statistics: { mean: mean.toFixed(3), stdDev: std.toFixed(3), zThreshold },
    anomalies,
    riskLevel: anomalies.length > req.values.length * 0.1 ? "High"
             : anomalies.length > 0 ? "Medium" : "Low",
  };
}

function predictRUL(req: RULRequest): object {
  const models: Record<string, { description: string; unit: string; formula: string }> = {
    fatigue:    { description: "Paris Law fatigue crack growth", unit: "cycles", formula: "da/dN = C·ΔK^m" },
    corrosion:  { description: "Faraday corrosion rate model",   unit: "years",  formula: "rate = k·i·t/(ρ·F)" },
    settlement: { description: "Linear settlement progression",  unit: "years",  formula: "s(t) = s₀ + rate·t" },
  };

  const model = models[req.deteriorationModel];
  const threshold = req.threshold ?? (req.deteriorationModel === "fatigue" ? 1000000
                                    : req.deteriorationModel === "corrosion" ? 0.5 : 50);
  const rate = req.historicalRate ?? (req.deteriorationModel === "fatigue" ? 1000
                                    : req.deteriorationModel === "corrosion" ? 0.02 : 0.5);

  const remaining = Math.max(0, threshold - req.currentValue);
  const rul        = rate > 0 ? remaining / rate : Infinity;

  return {
    bridgeId: req.bridgeId,
    model: req.deteriorationModel,
    modelDescription: model.description,
    formula: model.formula,
    currentValue: req.currentValue,
    threshold,
    remaining,
    estimatedRUL: isFinite(rul) ? Math.round(rul) : "Indeterminate",
    unit: model.unit,
    urgency: rul < 1 ? "Critical" : rul < 5 ? "High" : rul < 20 ? "Medium" : "Low",
    recommendation: rul < 1 ? "Immediate structural intervention required"
                  : rul < 5 ? "Plan major maintenance within 12 months"
                  : rul < 20 ? "Schedule maintenance in next inspection cycle" : "Continue routine monitoring",
  };
}

function generateMaintenanceSchedule(req: MaintenanceRequest): object {
  const tasks: { task: string; priority: string; timeframe: string; estimatedCost: string }[] = [];

  if (req.healthScore < 40) {
    tasks.push({ task: "Emergency structural inspection", priority: "Critical", timeframe: "Within 48 hours", estimatedCost: "$15,000–$25,000" });
    tasks.push({ task: "Load restriction implementation",  priority: "Critical", timeframe: "Immediate",       estimatedCost: "$2,000–$5,000" });
  } else if (req.healthScore < 60) {
    tasks.push({ task: "Comprehensive bridge inspection",  priority: "High",     timeframe: "Within 2 weeks",  estimatedCost: "$8,000–$15,000" });
    tasks.push({ task: "Structural reinforcement assessment", priority: "High",  timeframe: "Within 1 month",  estimatedCost: "$20,000–$50,000" });
  } else if (req.healthScore < 80) {
    tasks.push({ task: "Routine visual inspection",        priority: "Medium",   timeframe: "Within 3 months", estimatedCost: "$3,000–$6,000" });
    tasks.push({ task: "Sensor calibration check",        priority: "Low",      timeframe: "Within 6 months", estimatedCost: "$1,000–$2,000" });
  } else {
    tasks.push({ task: "Annual structural inspection",     priority: "Low",      timeframe: "Within 12 months",estimatedCost: "$5,000–$10,000" });
    tasks.push({ task: "Preventive coating inspection",   priority: "Low",      timeframe: "Within 18 months",estimatedCost: "$2,000–$4,000" });
  }

  if (req.criticalSensors?.length) {
    tasks.push({ task: `Replace/recalibrate sensors: ${req.criticalSensors.join(", ")}`,
                 priority: "Medium", timeframe: "Within 1 month", estimatedCost: "$500–$2,000 per sensor" });
  }

  const lastDate = new Date(req.lastInspection);
  const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);

  return {
    bridgeId: req.bridgeId,
    healthScore: req.healthScore,
    daysSinceLastInspection: daysSince,
    scheduledTasks: tasks,
    totalEstimatedTasks: tasks.length,
    nextInspectionDue: new Date(Date.now() + (req.healthScore >= 80 ? 365 : req.healthScore >= 60 ? 90 : 14) * 86400000)
      .toISOString().split("T")[0],
    generatedAt: new Date().toISOString(),
  };
}

// ─── HTTP router ─────────────────────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => (body += chunk.toString()));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function router(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url    = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const method = req.method?.toUpperCase() ?? "GET";

  // CORS pre-flight
  if (method === "OPTIONS") { send(res, 204, {}); return; }

  // Liveness
  if (url.pathname === "/health" && method === "GET") {
    send(res, 200, { status: "ok", version: "1.0.0", timestamp: new Date().toISOString() });
    return;
  }

  // API index
  if (url.pathname === "/" && method === "GET") {
    send(res, 200, {
      name: "ARIA Bridge Health API",
      version: "1.0.0",
      endpoints: [
        "POST /api/sensor-reading",
        "POST /api/structural-health",
        "POST /api/alert-threshold",
        "POST /api/maintenance-schedule",
        "POST /api/anomaly-detect",
        "POST /api/rul",
        "GET  /api/bridge-registry",
        "GET  /health",
      ],
    });
    return;
  }

  // Bridge registry
  if (url.pathname === "/api/bridge-registry" && method === "GET") {
    send(res, 200, { bridges: BRIDGE_REGISTRY, total: Object.keys(BRIDGE_REGISTRY).length });
    return;
  }

  // POST routes
  if (method === "POST") {
    let body: unknown;
    try { body = await parseBody(req); }
    catch (e) { send(res, 400, { error: (e as Error).message }); return; }

    switch (url.pathname) {
      case "/api/sensor-reading":
        send(res, 200, analyseSensorReading(body as SensorReading));
        return;
      case "/api/structural-health":
        send(res, 200, calculateStructuralHealth(body as HealthRequest));
        return;
      case "/api/anomaly-detect":
        send(res, 200, detectAnomalies(body as AnomalyRequest));
        return;
      case "/api/rul":
        send(res, 200, predictRUL(body as RULRequest));
        return;
      case "/api/maintenance-schedule":
        send(res, 200, generateMaintenanceSchedule(body as MaintenanceRequest));
        return;
      case "/api/alert-threshold": {
        // Simple passthrough — evaluate a single reading
        const reading = body as SensorReading;
        send(res, 200, { ...analyseSensorReading(reading), checkedAt: new Date().toISOString() });
        return;
      }
    }
  }

  send(res, 404, { error: "Not found", path: url.pathname });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3001", 10);

const server = http.createServer((req, res) => {
  router(req, res).catch(err => {
    console.error("Unhandled error:", err);
    send(res, 500, { error: "Internal server error" });
  });
});

server.listen(PORT, () => {
  console.log(`ARIA API server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API index:    http://localhost:${PORT}/`);
});

export default server;
