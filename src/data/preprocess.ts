/**
 * ============================================================
 * src/data/preprocess.ts
 * ARIA — Data Preprocessing & Quality Pipeline
 * ============================================================
 *
 * Responsibilities:
 *   - Detect and handle missing data gaps (>5% threshold)
 *   - Remove or flag statistical outliers (IQR method)
 *   - Compute rolling statistics for trend analysis
 *   - Produce a clean dataset ready for model input
 * ============================================================
 */

import { NormalisedReading } from "./ingest.js";

// ─── Types ───────────────────────────────────────────────────

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  status: string;
}

export interface PreprocessedSeries {
  sensor_id: string;
  sensor_type: string;
  location: string;
  unit: string;
  total_points: number;
  missing_pct: number;
  outliers_flagged: number;
  clean_series: TimeSeriesPoint[];
  rolling_mean: number[];
  rolling_std: number[];
  trend_slope: number; // value change per hour
  quality_score: number; // 0–100
}

// ─── Gap detection ────────────────────────────────────────────

export function detectGaps(
  series: TimeSeriesPoint[],
  expectedIntervalMs = 3_600_000 // 1 hour default
): number {
  if (series.length < 2) return 0;
  let gaps = 0;
  for (let i = 1; i < series.length; i++) {
    const delta =
      new Date(series[i].timestamp).getTime() -
      new Date(series[i - 1].timestamp).getTime();
    if (delta > expectedIntervalMs * 1.5) gaps++;
  }
  return gaps;
}

// ─── IQR outlier detection ────────────────────────────────────

export function flagOutliers(series: TimeSeriesPoint[]): {
  clean: TimeSeriesPoint[];
  outlierCount: number;
} {
  if (series.length < 4) return { clean: series, outlierCount: 0 };

  const values = series.map((p) => p.value).sort((a, b) => a - b);
  const q1 = values[Math.floor(values.length * 0.25)];
  const q3 = values[Math.floor(values.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  let outlierCount = 0;
  const clean = series.map((p) => {
    if (p.value < lower || p.value > upper) {
      outlierCount++;
      return { ...p, status: "SUSPECT" };
    }
    return p;
  });

  return { clean, outlierCount };
}

// ─── Rolling statistics ───────────────────────────────────────

export function rollingStats(
  values: number[],
  window = 6
): { means: number[]; stds: number[] } {
  const means: number[] = [];
  const stds: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const std = Math.sqrt(
      slice.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / slice.length
    );
    means.push(Math.round(mean * 1000) / 1000);
    stds.push(Math.round(std * 1000) / 1000);
  }

  return { means, stds };
}

// ─── Linear trend slope (value/hour) ─────────────────────────

export function computeTrendSlope(series: TimeSeriesPoint[]): number {
  if (series.length < 2) return 0;
  const n = series.length;
  const t0 = new Date(series[0].timestamp).getTime();
  const xs = series.map((p) => (new Date(p.timestamp).getTime() - t0) / 3_600_000);
  const ys = series.map((p) => p.value);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return Math.round(((n * sumXY - sumX * sumY) / denom) * 10000) / 10000;
}

// ─── Full preprocessing pipeline ─────────────────────────────

export function preprocessSeries(
  sensorId: string,
  sensorType: string,
  location: string,
  unit: string,
  rawSeries: TimeSeriesPoint[]
): PreprocessedSeries {
  const total = rawSeries.length;

  // Gap detection
  const gapCount = detectGaps(rawSeries);
  const missing_pct = total > 0 ? Math.round((gapCount / total) * 1000) / 10 : 0;

  // Outlier flagging
  const { clean, outlierCount } = flagOutliers(rawSeries);

  // Rolling stats
  const values = clean.map((p) => p.value);
  const { means, stds } = rollingStats(values);

  // Trend
  const trend_slope = computeTrendSlope(clean);

  // Quality score: deduct for gaps and outliers
  const quality_score = Math.max(
    0,
    100 - missing_pct * 2 - (outlierCount / total) * 30
  );

  return {
    sensor_id: sensorId,
    sensor_type: sensorType,
    location,
    unit,
    total_points: total,
    missing_pct,
    outliers_flagged: outlierCount,
    clean_series: clean,
    rolling_mean: means,
    rolling_std: stds,
    trend_slope,
    quality_score: Math.round(quality_score),
  };
}

// ─── Preprocess from NormalisedReading array ─────────────────

export function preprocessReadings(
  readings: NormalisedReading[]
): Record<string, PreprocessedSeries> {
  const result: Record<string, PreprocessedSeries> = {};

  for (const r of readings) {
    result[r.sensor_id] = preprocessSeries(
      r.sensor_id,
      r.sensor_type,
      r.location,
      r.unit,
      [{ timestamp: r.timestamp, value: r.value, status: r.status }]
    );
  }

  return result;
}
