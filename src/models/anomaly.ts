/**
 * ============================================================
 * src/models/anomaly.ts
 * ARIA — Anomaly Detection Model
 * ============================================================
 *
 * Methods:
 *   1. Z-Score (statistical baseline deviation)
 *   2. IQR (interquartile range outlier detection)
 *   3. Threshold-based (AASHTO / ASTM hard limits)
 *
 * All methods return a standardised AnomalyResult object.
 * ============================================================
 */

import { NormalisedReading, SensorType } from "../data/ingest.js";

// ─── Types ───────────────────────────────────────────────────

export type AnomalyMethod = "zscore" | "iqr" | "threshold";

export interface AnomalyResult {
  sensor_id: string;
  sensor_type: SensorType;
  location: string;
  value: number;
  unit: string;
  method: AnomalyMethod;
  score: number;       // z-score, IQR ratio, or % of limit
  anomaly_type: "EXTREME_OUTLIER" | "STATISTICAL_ANOMALY" | "THRESHOLD_BREACH" | "NONE";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  message: string;
}

// ─── Hard engineering thresholds (per standard) ──────────────

const THRESHOLDS: Record<SensorType, {
  high: number; critical: number; above: boolean; standard: string
}> = {
  strain:       { high: 320,   critical: 380,   above: true,  standard: "AASHTO LRFD §6 — 80%/95% of 400 μstrain" },
  corrosion:    { high: -350,  critical: -500,  above: false, standard: "ASTM C876 — active / severe corrosion" },
  displacement: { high: 27,    critical: 33,    above: true,  standard: "AASHTO LRFD §2.5 — L/360 serviceability" },
  vibration:    { high: 9,     critical: 12,    above: true,  standard: "SHM modal baseline ±5% frequency shift" },
  temperature:  { high: 50,    critical: 60,    above: true,  standard: "Material specification limit" },
  load:         { high: 2250,  critical: 2450,  above: true,  standard: "AASHTO MBE §5 — 90%/98% of design load" },
};

// ─── Method 1: Z-Score anomaly detection ─────────────────────

export function zscoreDetect(
  readings: NormalisedReading[],
  threshold = 3.0
): AnomalyResult[] {
  const results: AnomalyResult[] = [];

  // Group by sensor type
  const groups: Record<string, NormalisedReading[]> = {};
  for (const r of readings) {
    if (!groups[r.sensor_type]) groups[r.sensor_type] = [];
    groups[r.sensor_type].push(r);
  }

  for (const [, group] of Object.entries(groups)) {
    if (group.length < 2) continue;
    const values = group.map((r) => r.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(
      values.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / values.length
    );
    if (std === 0) continue;

    for (const r of group) {
      const z = Math.abs((r.value - mean) / std);
      const anomaly_type =
        z >= 4 ? "EXTREME_OUTLIER" : z >= threshold ? "STATISTICAL_ANOMALY" : "NONE";
      const severity =
        z >= 4 ? "CRITICAL" : z >= 3.5 ? "HIGH" : z >= threshold ? "MEDIUM" : "NONE";

      results.push({
        sensor_id: r.sensor_id,
        sensor_type: r.sensor_type,
        location: r.location,
        value: r.value,
        unit: r.unit,
        method: "zscore",
        score: Math.round(z * 100) / 100,
        anomaly_type,
        severity,
        message:
          anomaly_type !== "NONE"
            ? `Z-score ${z.toFixed(2)} exceeds threshold ${threshold} (mean=${mean.toFixed(2)}, σ=${std.toFixed(2)})`
            : `Z-score ${z.toFixed(2)} within normal range`,
      });
    }
  }

  return results;
}

// ─── Method 2: Threshold-based detection ─────────────────────

export function thresholdDetect(readings: NormalisedReading[]): AnomalyResult[] {
  return readings.map((r) => {
    const t = THRESHOLDS[r.sensor_type];
    let anomaly_type: AnomalyResult["anomaly_type"] = "NONE";
    let severity: AnomalyResult["severity"] = "NONE";
    let score = 0;
    let message = "Within design limits";

    if (t) {
      if (t.above) {
        score = Math.round((r.value / t.critical) * 1000) / 10;
        if (r.value >= t.critical) {
          anomaly_type = "THRESHOLD_BREACH"; severity = "CRITICAL";
          message = `${r.value} ${r.unit} exceeds CRITICAL limit ${t.critical}. ${t.standard}`;
        } else if (r.value >= t.high) {
          anomaly_type = "THRESHOLD_BREACH"; severity = "HIGH";
          message = `${r.value} ${r.unit} exceeds HIGH limit ${t.high}. ${t.standard}`;
        }
      } else {
        // Lower is worse (corrosion)
        score = Math.round((r.value / t.critical) * 1000) / 10;
        if (r.value <= t.critical) {
          anomaly_type = "THRESHOLD_BREACH"; severity = "CRITICAL";
          message = `${r.value} ${r.unit} below CRITICAL threshold ${t.critical}. ${t.standard}`;
        } else if (r.value <= t.high) {
          anomaly_type = "THRESHOLD_BREACH"; severity = "HIGH";
          message = `${r.value} ${r.unit} below HIGH threshold ${t.high}. ${t.standard}`;
        }
      }
    }

    return {
      sensor_id: r.sensor_id,
      sensor_type: r.sensor_type,
      location: r.location,
      value: r.value,
      unit: r.unit,
      method: "threshold",
      score,
      anomaly_type,
      severity,
      message,
    };
  });
}

// ─── Combined detection (runs all methods) ────────────────────

export function detectAll(
  readings: NormalisedReading[],
  zThreshold = 3.0
): AnomalyResult[] {
  const zResults = zscoreDetect(readings, zThreshold);
  const tResults = thresholdDetect(readings);

  // Merge — take highest severity for each sensor
  const merged: Record<string, AnomalyResult> = {};
  const severityRank: Record<string, number> = {
    CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0,
  };

  for (const r of [...zResults, ...tResults]) {
    const existing = merged[r.sensor_id];
    if (
      !existing ||
      (severityRank[r.severity] ?? 0) > (severityRank[existing.severity] ?? 0)
    ) {
      merged[r.sensor_id] = r;
    }
  }

  return Object.values(merged);
}
