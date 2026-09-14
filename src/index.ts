#!/usr/bin/env node
/**
 * ============================================================
 * ARIA — Bridge Health Monitoring & Predictive Maintenance
 * MCP Server  |  Team: StructIQ Four  |  IBM Bob Hackathon
 * ============================================================
 *
 * Exposes 9 MCP tools for:
 *   - Live sensor data retrieval
 *   - Structural health analysis
 *   - Statistical anomaly detection
 *   - Predictive RUL modelling (fatigue / corrosion / settlement)
 *   - Maintenance recommendation generation
 *
 * Transport : stdio (Bob spawns this as a child process)
 * Build     : npm run build  →  build/index.js
 * Register  : ~/.bob/settings/mcp.json
 *
 * TO CONNECT REAL SENSORS:
 *   Replace the BRIDGES registry (~line 60) with a real DB/API fetch.
 *   Replace generateHistory() with a real time-series query.
 *   All tool interfaces, schema validation, and Bob integration stay unchanged.
 * ============================================================
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────

interface SensorReading {
  sensor_id: string;
  sensor_type: "strain" | "vibration" | "displacement" | "temperature" | "corrosion" | "load";
  location: string;
  value: number;
  unit: string;
  timestamp: string;
  status: "OK" | "ALERT" | "FAULT" | "OFFLINE";
  alert_level?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

interface Bridge {
  id: string;
  name: string;
  type: string;
  year_built: number;
  span_m: number;
  design_load_kN: number;
  location: string;
  overall_health_score: number;
  operational_status: "OPERATIONAL" | "RESTRICTED" | "CRITICAL" | "CLOSED";
  last_inspection: string;
  sensors: SensorReading[];
}

// ─────────────────────────────────────────────────────────────
// SIMULATED BRIDGE REGISTRY
// Replace with real DB / REST API in production.
// ─────────────────────────────────────────────────────────────

const BRIDGES: Record<string, Bridge> = {
  "BRG-001": {
    id: "BRG-001",
    name: "Riverside Highway Bridge",
    type: "Prestressed Concrete Beam",
    year_built: 1988,
    span_m: 120,
    design_load_kN: 2500,
    location: "Riverside, CA, USA",
    overall_health_score: 62,
    operational_status: "RESTRICTED",
    last_inspection: "2024-06-15",
    sensors: [
      {
        sensor_id: "S001-STRAIN-MID",
        sensor_type: "strain",
        location: "Mid-span bottom flange",
        value: 342,
        unit: "microstrain",
        timestamp: new Date().toISOString(),
        status: "ALERT",
        alert_level: "HIGH",
      },
      {
        sensor_id: "S002-DISP-MID",
        sensor_type: "displacement",
        location: "Mid-span vertical",
        value: 28.4,
        unit: "mm",
        timestamp: new Date().toISOString(),
        status: "OK",
      },
      {
        sensor_id: "S003-VIB-PIER1",
        sensor_type: "vibration",
        location: "Pier 1 North",
        value: 4.7,
        unit: "Hz",
        timestamp: new Date().toISOString(),
        status: "ALERT",
        alert_level: "MEDIUM",
      },
      {
        sensor_id: "S004-CORR-DECK",
        sensor_type: "corrosion",
        location: "Deck rebar zone B",
        value: -410,
        unit: "mV (CSE)",
        timestamp: new Date().toISOString(),
        status: "ALERT",
        alert_level: "HIGH",
      },
      {
        sensor_id: "S005-TEMP-MAIN",
        sensor_type: "temperature",
        location: "Main girder",
        value: 34.2,
        unit: "°C",
        timestamp: new Date().toISOString(),
        status: "OK",
      },
      {
        sensor_id: "S006-LOAD-ENTRY",
        sensor_type: "load",
        location: "Entry axle weigh-in-motion",
        value: 2180,
        unit: "kN",
        timestamp: new Date().toISOString(),
        status: "OK",
      },
    ],
  },
  "BRG-002": {
    id: "BRG-002",
    name: "Northgate Cable-Stay Bridge",
    type: "Cable-Stayed",
    year_built: 2003,
    span_m: 380,
    design_load_kN: 5000,
    location: "Northgate, WA, USA",
    overall_health_score: 88,
    operational_status: "OPERATIONAL",
    last_inspection: "2024-11-02",
    sensors: [
      {
        sensor_id: "S101-STRAIN-CABLE1",
        sensor_type: "strain",
        location: "Stay cable C1",
        value: 198,
        unit: "microstrain",
        timestamp: new Date().toISOString(),
        status: "OK",
      },
      {
        sensor_id: "S102-DISP-TOWER",
        sensor_type: "displacement",
        location: "Tower top lateral",
        value: 12.1,
        unit: "mm",
        timestamp: new Date().toISOString(),
        status: "OK",
      },
      {
        sensor_id: "S103-VIB-DECK",
        sensor_type: "vibration",
        location: "Deck centre span",
        value: 0.48,
        unit: "Hz",
        timestamp: new Date().toISOString(),
        status: "OK",
      },
      {
        sensor_id: "S104-CORR-ANCHOR",
        sensor_type: "corrosion",
        location: "Cable anchor block",
        value: -290,
        unit: "mV (CSE)",
        timestamp: new Date().toISOString(),
        status: "OK",
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// SENSOR HISTORY GENERATOR
// Replace with real time-series DB query in production.
// Example: const rows = await influx.query(`SELECT * FROM sensors
//          WHERE sensor_id='${sensorId}' AND time > now()-${hours}h`);
// ─────────────────────────────────────────────────────────────

function generateHistory(
  sensorId: string,
  bridgeId: string,
  hours: number
): Array<{ timestamp: string; value: number; status: string }> {
  const bridge = BRIDGES[bridgeId];
  if (!bridge) return [];
  const sensor = bridge.sensors.find((s) => s.sensor_id === sensorId);
  if (!sensor) return [];

  const history = [];
  const now = Date.now();
  const baseValue = sensor.value;

  for (let i = hours; i >= 0; i--) {
    const noise = (Math.random() - 0.5) * Math.abs(baseValue) * 0.05;
    const trend = sensor.status === "ALERT" ? (hours - i) * (Math.abs(baseValue) * 0.001) : 0;
    const value = Math.round((baseValue - trend + noise) * 100) / 100;
    history.push({
      timestamp: new Date(now - i * 3_600_000).toISOString(),
      value,
      status: value > Math.abs(baseValue) * 0.9 && sensor.status === "ALERT" ? "ALERT" : "OK",
    });
  }
  return history;
}

// ─────────────────────────────────────────────────────────────
// MCP SERVER
// ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "bridge-health-mcp",
  version: "1.0.0",
});

// ─────────────────────────────────────────────────────────────
// TOOL 1: list_bridges
// ─────────────────────────────────────────────────────────────

server.tool(
  "list_bridges",
  "List all monitored bridges with their current operational status and health scores.",
  {},
  async () => {
    const summary = Object.values(BRIDGES).map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      location: b.location,
      operational_status: b.operational_status,
      overall_health_score: b.overall_health_score,
      last_inspection: b.last_inspection,
      active_alerts: b.sensors.filter(
        (s) => s.status === "ALERT" || s.status === "FAULT"
      ).length,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }
);

// ─────────────────────────────────────────────────────────────
// TOOL 2: get_bridge_status
// ─────────────────────────────────────────────────────────────

server.tool(
  "get_bridge_status",
  "Get the current operational status, health score, and alert summary for a specific bridge.",
  {
    bridge_id: z.string().describe("Bridge identifier (e.g. BRG-001)"),
  },
  async ({ bridge_id }) => {
    const bridge = BRIDGES[bridge_id];
    if (!bridge) {
      return {
        content: [
          {
            type: "text",
            text: `Bridge '${bridge_id}' not found. Available: ${Object.keys(BRIDGES).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const alerts = bridge.sensors.filter((s) => s.status !== "OK");
    const status = {
      id: bridge.id,
      name: bridge.name,
      type: bridge.type,
      year_built: bridge.year_built,
      span_m: bridge.span_m,
      location: bridge.location,
      operational_status: bridge.operational_status,
      overall_health_score: bridge.overall_health_score,
      last_inspection: bridge.last_inspection,
      total_sensors: bridge.sensors.length,
      alert_count: alerts.length,
      alerts: alerts.map((s) => ({
        sensor_id: s.sensor_id,
        location: s.location,
        status: s.status,
        alert_level: s.alert_level ?? "N/A",
        value: `${s.value} ${s.unit}`,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
    };
  }
);

// ─────────────────────────────────────────────────────────────
// TOOL 3: get_sensor_readings
// ─────────────────────────────────────────────────────────────

server.tool(
  "get_sensor_readings",
  "Fetch all current sensor readings for a bridge, optionally filtered by sensor type.",
  {
    bridge_id: z.string().describe("Bridge identifier"),
    sensor_type: z
      .enum(["strain", "vibration", "displacement", "temperature", "corrosion", "load", "all"])
      .optional()
      .describe("Filter by sensor type (default: all)"),
  },
  async ({ bridge_id, sensor_type = "all" }) => {
    const bridge = BRIDGES[bridge_id];
    if (!bridge) {
      return {
        content: [{ type: "text", text: `Bridge '${bridge_id}' not found.` }],
        isError: true,
      };
    }

    const readings =
      sensor_type === "all"
        ? bridge.sensors
        : bridge.sensors.filter((s) => s.sensor_type === sensor_type);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              bridge_id,
              bridge_name: bridge.name,
              query_time: new Date().toISOString(),
              sensor_count: readings.length,
              readings,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────
// TOOL 4: get_sensor_history
// ─────────────────────────────────────────────────────────────

server.tool(
  "get_sensor_history",
  "Retrieve time-series history for a specific sensor over the last N hours.",
  {
    bridge_id: z.string().describe("Bridge identifier"),
    sensor_id: z.string().describe("Sensor identifier (e.g. S001-STRAIN-MID)"),
    hours: z
      .number()
      .min(1)
      .max(720)
      .optional()
      .describe("Number of hours to look back (default: 24, max: 720)"),
  },
  async ({ bridge_id, sensor_id, hours = 24 }) => {
    const bridge = BRIDGES[bridge_id];
    if (!bridge) {
      return {
        content: [{ type: "text", text: `Bridge '${bridge_id}' not found.` }],
        isError: true,
      };
    }

    const sensor = bridge.sensors.find((s) => s.sensor_id === sensor_id);
    if (!sensor) {
      return {
        content: [
          {
            type: "text",
            text: `Sensor '${sensor_id}' not found on bridge '${bridge_id}'.`,
          },
        ],
        isError: true,
      };
    }

    const history = generateHistory(sensor_id, bridge_id, hours);
    const values = history.map((h) => h.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / values.length
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              bridge_id,
              sensor_id,
              sensor_type: sensor.sensor_type,
              location: sensor.location,
              unit: sensor.unit,
              period_hours: hours,
              statistics: {
                mean: Math.round(mean * 100) / 100,
                std_dev: Math.round(stdDev * 100) / 100,
                min: Math.min(...values),
                max: Math.max(...values),
                data_points: history.length,
              },
              history,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────
// TOOL 5: analyze_sensor_data
// ─────────────────────────────────────────────────────────────

server.tool(
  "analyze_sensor_data",
  "Run a full structural health analysis on all sensors for a bridge. Returns threshold violations, findings, and a computed health score.",
  {
    bridge_id: z.string().describe("Bridge identifier"),
  },
  async ({ bridge_id }) => {
    const bridge = BRIDGES[bridge_id];
    if (!bridge) {
      return {
        content: [{ type: "text", text: `Bridge '${bridge_id}' not found.` }],
        isError: true,
      };
    }

    const findings: Array<{
      sensor_id: string;
      sensor_type: string;
      location: string;
      finding: string;
      severity: string;
      recommendation: string;
    }> = [];

    for (const sensor of bridge.sensors) {
      // ── Strain thresholds (AASHTO LRFD §6) ──
      if (sensor.sensor_type === "strain") {
        const limitPercent = (sensor.value / 400) * 100; // design limit: 400 microstrain
        if (limitPercent >= 95) {
          findings.push({
            sensor_id: sensor.sensor_id,
            sensor_type: "strain",
            location: sensor.location,
            finding: `Strain at ${limitPercent.toFixed(1)}% of design limit (${sensor.value} ${sensor.unit})`,
            severity: "CRITICAL",
            recommendation:
              "Immediately restrict traffic load. Conduct emergency NDT inspection. Ref: AASHTO LRFD §1.3.",
          });
        } else if (limitPercent >= 80) {
          findings.push({
            sensor_id: sensor.sensor_id,
            sensor_type: "strain",
            location: sensor.location,
            finding: `Strain at ${limitPercent.toFixed(1)}% of design limit (${sensor.value} ${sensor.unit})`,
            severity: "HIGH",
            recommendation:
              "Schedule load restriction and fatigue assessment within 7 days. Ref: AASHTO LRFD §6.",
          });
        }
      }

      // ── Corrosion thresholds (ASTM C876) ──
      if (sensor.sensor_type === "corrosion") {
        const mV = sensor.value;
        if (mV < -500) {
          findings.push({
            sensor_id: sensor.sensor_id,
            sensor_type: "corrosion",
            location: sensor.location,
            finding: `Severe active corrosion: ${mV} mV (CSE). Critical threshold: < -500 mV.`,
            severity: "CRITICAL",
            recommendation:
              "Emergency cathodic protection or patch repair required. Ref: ASTM C876.",
          });
        } else if (mV < -350) {
          findings.push({
            sensor_id: sensor.sensor_id,
            sensor_type: "corrosion",
            location: sensor.location,
            finding: `Active corrosion: ${mV} mV (CSE). Threshold: < -350 mV.`,
            severity: "HIGH",
            recommendation:
              "Schedule corrosion survey and repair within 7 days. Ref: ASTM C876.",
          });
        }
      }

      // ── Vibration / frequency shift ──
      if (sensor.sensor_type === "vibration") {
        if (sensor.value < 2.5 || sensor.value > 12) {
          findings.push({
            sensor_id: sensor.sensor_id,
            sensor_type: "vibration",
            location: sensor.location,
            finding: `Natural frequency ${sensor.value} Hz outside expected range (2.5–12 Hz). Possible structural change.`,
            severity: "MEDIUM",
            recommendation:
              "Review modal analysis baseline. Inspect bearings and connections visually.",
          });
        }
      }

      // ── Sensor hardware fault ──
      if (sensor.status === "FAULT") {
        findings.push({
          sensor_id: sensor.sensor_id,
          sensor_type: sensor.sensor_type,
          location: sensor.location,
          finding: "Sensor reporting FAULT — data unreliable.",
          severity: "MEDIUM",
          recommendation: "Dispatch maintenance crew to inspect and replace sensor unit.",
        });
      }
    }

    // Health score: 100 minus severity deductions
    const deductions: Record<string, number> = {
      CRITICAL: 25,
      HIGH: 10,
      MEDIUM: 5,
      LOW: 2,
    };
    let computedScore = 100;
    for (const f of findings) {
      computedScore -= deductions[f.severity] ?? 0;
    }
    computedScore = Math.max(0, computedScore);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              bridge_id,
              bridge_name: bridge.name,
              analysis_time: new Date().toISOString(),
              computed_health_score: computedScore,
              finding_count: findings.length,
              findings_by_severity: {
                CRITICAL: findings.filter((f) => f.severity === "CRITICAL").length,
                HIGH: findings.filter((f) => f.severity === "HIGH").length,
                MEDIUM: findings.filter((f) => f.severity === "MEDIUM").length,
                LOW: findings.filter((f) => f.severity === "LOW").length,
              },
              findings,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────
// TOOL 6: detect_anomalies
// ─────────────────────────────────────────────────────────────

server.tool(
  "detect_anomalies",
  "Run statistical Z-score anomaly detection across all sensor readings for a bridge.",
  {
    bridge_id: z.string().describe("Bridge identifier"),
    z_score_threshold: z
      .number()
      .min(1)
      .max(5)
      .optional()
      .describe("Z-score threshold for anomaly flagging (default: 3.0)"),
  },
  async ({ bridge_id, z_score_threshold = 3.0 }) => {
    const bridge = BRIDGES[bridge_id];
    if (!bridge) {
      return {
        content: [{ type: "text", text: `Bridge '${bridge_id}' not found.` }],
        isError: true,
      };
    }

    const anomalies: Array<{
      sensor_id: string;
      location: string;
      value: number;
      unit: string;
      z_score: number;
      anomaly_type: string;
    }> = [];

    // Group sensors by type, compute Z-scores within each group
    const typeGroups: Record<string, SensorReading[]> = {};
    for (const sensor of bridge.sensors) {
      if (!typeGroups[sensor.sensor_type]) typeGroups[sensor.sensor_type] = [];
      typeGroups[sensor.sensor_type].push(sensor);
    }

    for (const [, sensors] of Object.entries(typeGroups)) {
      if (sensors.length < 2) continue;
      const values = sensors.map((s) => s.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(
        values.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / values.length
      );
      if (stdDev === 0) continue;

      for (const sensor of sensors) {
        const z = Math.abs((sensor.value - mean) / stdDev);
        if (z >= z_score_threshold) {
          anomalies.push({
            sensor_id: sensor.sensor_id,
            location: sensor.location,
            value: sensor.value,
            unit: sensor.unit,
            z_score: Math.round(z * 100) / 100,
            anomaly_type:
              z >= 4 ? "EXTREME_OUTLIER" : "STATISTICAL_ANOMALY",
          });
        }
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              bridge_id,
              bridge_name: bridge.name,
              analysis_time: new Date().toISOString(),
              z_score_threshold,
              anomaly_count: anomalies.length,
              anomalies,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────
// TOOL 7: run_predictive_model
// ─────────────────────────────────────────────────────────────

server.tool(
  "run_predictive_model",
  "Run a physics-based Remaining Useful Life (RUL) model for a bridge component. Supports fatigue (Paris-law), corrosion (Faraday), and settlement (linear) models.",
  {
    bridge_id: z.string().describe("Bridge identifier"),
    component: z
      .enum(["deck", "bearing", "cable", "pier", "girder", "rebar"])
      .describe("Structural component to model"),
    model_type: z
      .enum(["fatigue", "corrosion", "settlement"])
      .describe("Degradation model: fatigue | corrosion | settlement"),
    load_cycles_per_day: z
      .number()
      .optional()
      .describe("Daily load cycles for fatigue model (default: 5000)"),
  },
  async ({ bridge_id, component, model_type, load_cycles_per_day = 5000 }) => {
    const bridge = BRIDGES[bridge_id];
    if (!bridge) {
      return {
        content: [{ type: "text", text: `Bridge '${bridge_id}' not found.` }],
        isError: true,
      };
    }

    const age = new Date().getFullYear() - bridge.year_built;
    let rul_years: number;
    let confidence: string;
    let notes: string;

    if (model_type === "fatigue") {
      // Miner's rule / Paris-law approximation
      const designLife = 75;
      const fatigueConsumed = (age * load_cycles_per_day * 365) / (50 * 5000 * 365);
      const remainingFraction = Math.max(0, 1 - fatigueConsumed);
      rul_years = Math.round(remainingFraction * designLife);
      confidence = remainingFraction > 0.5 ? "HIGH" : remainingFraction > 0.2 ? "MEDIUM" : "LOW";
      notes = `Paris-law model. Load cycles: ${load_cycles_per_day}/day. Design life: 75 yrs. Fatigue consumed: ${(fatigueConsumed * 100).toFixed(1)}%.`;
    } else if (model_type === "corrosion") {
      // Faraday cover depletion model
      const corrSensor = bridge.sensors.find((s) => s.sensor_type === "corrosion");
      const potential = corrSensor ? corrSensor.value : -300;
      const rate = potential < -500 ? 0.25 : potential < -350 ? 0.12 : 0.04; // mm/year
      const coverMm = 40;   // typical concrete cover depth
      const minCover = 15;  // minimum structural threshold
      const remainingCover = coverMm - age * rate;
      rul_years = Math.max(0, Math.round((remainingCover - minCover) / rate));
      confidence = rul_years > 20 ? "HIGH" : rul_years > 5 ? "MEDIUM" : "LOW";
      notes = `Faraday model. Corrosion rate: ${rate} mm/yr. Cover remaining: ${remainingCover.toFixed(1)} mm. Min threshold: ${minCover} mm.`;
    } else {
      // Linear settlement model
      const dispSensor = bridge.sensors.find((s) => s.sensor_type === "displacement");
      const currentDisp = dispSensor ? dispSensor.value : 15;
      const maxAllowable = bridge.span_m / 360; // L/360 serviceability limit
      const settlementRate = currentDisp / age;
      rul_years = Math.max(0, Math.round((maxAllowable - currentDisp) / settlementRate));
      confidence = rul_years > 20 ? "HIGH" : rul_years > 5 ? "MEDIUM" : "LOW";
      notes = `Linear settlement model. Rate: ${settlementRate.toFixed(2)} mm/yr. Current: ${currentDisp} mm. L/360 limit: ${maxAllowable.toFixed(1)} mm.`;
    }

    const recommendation =
      rul_years <= 5
        ? "CRITICAL: Schedule urgent structural assessment and rehabilitation planning."
        : rul_years <= 15
        ? "HIGH: Include in next capital maintenance programme."
        : rul_years <= 30
        ? "MEDIUM: Monitor closely; plan preventive maintenance."
        : "LOW: Continue routine monitoring as per current programme.";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              bridge_id,
              bridge_name: bridge.name,
              component,
              model_type,
              bridge_age_years: age,
              estimated_rul_years: rul_years,
              confidence_level: confidence,
              model_notes: notes,
              analysis_time: new Date().toISOString(),
              recommendation,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────
// TOOL 8: get_maintenance_recommendations
// ─────────────────────────────────────────────────────────────

server.tool(
  "get_maintenance_recommendations",
  "Generate a prioritised maintenance action plan (CRITICAL/HIGH/MEDIUM/LOW) based on current sensor alerts and bridge age.",
  {
    bridge_id: z.string().describe("Bridge identifier"),
    include_cost_estimate: z
      .boolean()
      .optional()
      .describe("Include rough cost estimates for each action (default: false)"),
  },
  async ({ bridge_id, include_cost_estimate = false }) => {
    const bridge = BRIDGES[bridge_id];
    if (!bridge) {
      return {
        content: [{ type: "text", text: `Bridge '${bridge_id}' not found.` }],
        isError: true,
      };
    }

    interface Recommendation {
      priority: string;
      component: string;
      finding: string;
      action: string;
      due_in: string;
      standard_reference: string;
      estimated_cost_usd?: string;
    }

    const recommendations: Recommendation[] = [];

    for (const sensor of bridge.sensors) {
      if (sensor.status === "OFFLINE" || sensor.status === "FAULT") {
        const rec: Recommendation = {
          priority: "MEDIUM",
          component: `Sensor ${sensor.sensor_id}`,
          finding: `Sensor ${sensor.status} at ${sensor.location}`,
          action: "Inspect, repair or replace sensor unit",
          due_in: "Within 14 days",
          standard_reference: "SHM maintenance protocol",
        };
        if (include_cost_estimate) rec.estimated_cost_usd = "$500–$2,000";
        recommendations.push(rec);
      }

      if (sensor.alert_level === "CRITICAL") {
        const rec: Recommendation = {
          priority: "CRITICAL",
          component: sensor.location,
          finding: `${sensor.sensor_type} reading ${sensor.value} ${sensor.unit} — CRITICAL threshold exceeded`,
          action: "Immediate inspection; consider traffic restriction or bridge closure",
          due_in: "Immediately",
          standard_reference: "AASHTO LRFD 9th Ed. Section 1.3",
        };
        if (include_cost_estimate) rec.estimated_cost_usd = "$50,000–$500,000+";
        recommendations.push(rec);
      } else if (sensor.alert_level === "HIGH") {
        const action =
          sensor.sensor_type === "corrosion"
            ? "Cathodic protection survey and patch repair"
            : sensor.sensor_type === "strain"
            ? "Fatigue assessment and load restriction"
            : "Targeted inspection and repair";

        const rec: Recommendation = {
          priority: "HIGH",
          component: sensor.location,
          finding: `${sensor.sensor_type} alert: ${sensor.value} ${sensor.unit}`,
          action,
          due_in: "Within 7 days",
          standard_reference: "Eurocode EN 1337 / AASHTO LRFD",
        };
        if (include_cost_estimate) rec.estimated_cost_usd = "$5,000–$50,000";
        recommendations.push(rec);
      }
    }

    // Age-based principal inspection
    const age = new Date().getFullYear() - bridge.year_built;
    if (age > 30) {
      const rec: Recommendation = {
        priority: "MEDIUM",
        component: "Full bridge",
        finding: `Bridge is ${age} years old — principal inspection overdue`,
        action: "Commission principal inspection per AASHTO MBE Section 5",
        due_in: "Within 30 days",
        standard_reference: "AASHTO MBE 3rd Ed. Section 5",
      };
      if (include_cost_estimate) rec.estimated_cost_usd = "$15,000–$80,000";
      recommendations.push(rec);
    }

    // Sort CRITICAL → HIGH → MEDIUM → LOW
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    recommendations.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              bridge_id,
              bridge_name: bridge.name,
              generated_at: new Date().toISOString(),
              total_actions: recommendations.length,
              summary: {
                CRITICAL: recommendations.filter((r) => r.priority === "CRITICAL").length,
                HIGH: recommendations.filter((r) => r.priority === "HIGH").length,
                MEDIUM: recommendations.filter((r) => r.priority === "MEDIUM").length,
                LOW: recommendations.filter((r) => r.priority === "LOW").length,
              },
              recommendations,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────
// TOOL 9: add_sensor_reading
// ─────────────────────────────────────────────────────────────

server.tool(
  "add_sensor_reading",
  "Update a simulated sensor reading for a bridge sensor. Useful for testing alert conditions and simulation.",
  {
    bridge_id: z.string().describe("Bridge identifier"),
    sensor_id: z.string().describe("Sensor identifier (e.g. S001-STRAIN-MID)"),
    value: z.number().describe("New sensor value to inject"),
    status: z
      .enum(["OK", "ALERT", "FAULT", "OFFLINE"])
      .optional()
      .describe("New sensor status (optional — auto-computed if omitted)"),
  },
  async ({ bridge_id, sensor_id, value, status }) => {
    const bridge = BRIDGES[bridge_id];
    if (!bridge) {
      return {
        content: [{ type: "text", text: `Bridge '${bridge_id}' not found.` }],
        isError: true,
      };
    }

    const sensor = bridge.sensors.find((s) => s.sensor_id === sensor_id);
    if (!sensor) {
      return {
        content: [{ type: "text", text: `Sensor '${sensor_id}' not found on bridge '${bridge_id}'.` }],
        isError: true,
      };
    }

    sensor.value = value;
    sensor.timestamp = new Date().toISOString();
    if (status) sensor.status = status;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              updated: true,
              bridge_id,
              sensor_id,
              new_value: value,
              new_status: sensor.status,
              timestamp: sensor.timestamp,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bridge Health MCP Server v1.0.0 running on stdio");
  console.error("Team: StructIQ Four | IBM Bob Hackathon");
}

main().catch((error) => {
  console.error("Fatal error in bridge-health-mcp:", error);
  process.exit(1);
});
