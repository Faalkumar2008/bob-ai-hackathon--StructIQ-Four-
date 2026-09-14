# ARIA Bridge Health Monitoring — Exploratory Analysis Notebook
## Notebook 01: Sensor Data Exploration & Baseline Profiling

**Author:** StructIQ Four — Faalkumar Patel, Tirth Patel  
**Track:** AI for Infrastructure & Safety  
**Last updated:** 2025-07-14

---

## 0. Purpose

This notebook establishes baseline statistics for each sensor type across all
five monitored bridges. It is the first step in the data-science pipeline:

```
Raw Ingestion → [THIS NOTEBOOK] → Preprocessing → Anomaly Detection → RUL Modelling
```

---

## 1. Setup

```typescript
import { ingestRawReadings, normaliseUnit } from "../data/ingest";
import { gapDetection, rollingStats, computeTrendSlope } from "../data/preprocess";
import { BridgeRegistry }                                from "../lib/bridge-registry";
import { mean, stdDev, percentile, groupBy }             from "../utils/helpers";

const bridges = BridgeRegistry.all();
console.log(`Loaded ${bridges.length} bridges`);
// → Loaded 5 bridges
```

---

## 2. Load Raw Sensor Data

We simulate 30 days of 5-minute readings (8,640 samples) per sensor per bridge.

```typescript
function generateSample(
  bridgeId: string,
  sensorType: string,
  n = 8640,
): Array<{ bridgeId: string; sensorType: string; value: number; unit: string; timestamp: string }> {
  const baselines: Record<string, { base: number; noise: number; unit: string }> = {
    vibration:    { base: 0.30, noise: 0.15, unit: "g"      },
    strain:       { base: 220,  noise: 50,   unit: "MPa"    },
    temperature:  { base: 22,   noise: 8,    unit: "celsius" },
    displacement: { base: 8,    noise: 3,    unit: "mm"     },
    corrosion:    { base: 0.05, noise: 0.02, unit: "mm/yr"  },
    load:         { base: 1200, noise: 300,  unit: "kN"     },
  };

  const cfg = baselines[sensorType] ?? { base: 50, noise: 10, unit: "unit" };
  const now  = Date.now();

  return Array.from({ length: n }, (_, i) => ({
    bridgeId,
    sensorType,
    value: Math.max(0, cfg.base + (Math.random() - 0.5) * 2 * cfg.noise),
    unit:  cfg.unit,
    timestamp: new Date(now - (n - i) * 5 * 60_000).toISOString(),
  }));
}

const vibrationData = generateSample("BRG-001", "vibration");
console.log(`Generated ${vibrationData.length} vibration readings for BRG-001`);
// → Generated 8640 vibration readings for BRG-001
```

---

## 3. Baseline Statistics

```typescript
const values = vibrationData.map(r => r.value);

console.table({
  count:  values.length,
  mean:   mean(values).toFixed(4),
  stdDev: stdDev(values).toFixed(4),
  p5:     percentile(values, 5).toFixed(4),
  p50:    percentile(values, 50).toFixed(4),
  p95:    percentile(values, 95).toFixed(4),
  p99:    percentile(values, 99).toFixed(4),
});
```

**Expected output:**

| Metric | Value |
|--------|-------|
| count  | 8640  |
| mean   | ~0.300 |
| stdDev | ~0.087 |
| p5     | ~0.151 |
| p50    | ~0.300 |
| p95    | ~0.450 |
| p99    | ~0.497 |

---

## 4. Gap Detection

```typescript
const gaps = gapDetection(vibrationData, 10); // >10 min gap = missing window
console.log(`Detected ${gaps.length} data gaps`);

if (gaps.length > 0) {
  console.table(gaps.slice(0, 5).map(g => ({
    start: g.start,
    end:   g.end,
    durationMin: g.durationSeconds / 60,
  })));
}
```

---

## 5. Rolling Statistics (1-hour window = 12 × 5-min samples)

```typescript
const rolled = rollingStats(vibrationData, 12);
console.log(`Rolling stats computed for ${rolled.length} windows`);

// Plot the rolling mean ± 2σ to visualise drift
const drifting = rolled.filter(w => w.mean > 0.6);
console.log(`Windows where rolling mean > 0.6g (warning-adjacent): ${drifting.length}`);
```

---

## 6. Trend Analysis

```typescript
const trend = computeTrendSlope(values);
console.log(`Linear trend slope: ${trend.toFixed(6)} g/reading`);
console.log(`Projected value at reading 10000: ${(mean(values) + trend * 10000).toFixed(4)} g`);
```

---

## 7. Cross-Bridge Baseline Comparison

```typescript
const sensorType = "vibration";

for (const bridge of bridges) {
  if (!bridge.sensors.includes(sensorType)) continue;
  const data   = generateSample(bridge.id, sensorType);
  const vals   = data.map(r => r.value);
  const m      = mean(vals);
  const sd     = stdDev(vals);
  const age    = BridgeRegistry.age(bridge.id);

  console.log(`${bridge.id} (${bridge.name}, age ${age}yr): mean=${m.toFixed(3)} σ=${sd.toFixed(3)}`);
}
```

**Expected output (random seed will vary):**

```
BRG-001 (Golden Gate Replica, age 88yr): mean=0.301 σ=0.086
BRG-002 (Harbor Crossing, age 60yr):     mean=0.299 σ=0.087
BRG-003 (River Valley Bridge, age 36yr): mean=0.300 σ=0.087
BRG-004 (Mountain Pass Span, age 23yr):  mean=0.301 σ=0.086
BRG-005 (Coastal Connector, age 47yr):   mean=0.300 σ=0.088
```

---

## 8. Data Quality Summary

```typescript
const ingestResult = ingestRawReadings(vibrationData);
console.table({
  accepted:  ingestResult.accepted.length,
  rejected:  ingestResult.rejected.length,
  rejectRate: `${((ingestResult.rejected.length / vibrationData.length) * 100).toFixed(2)}%`,
});
```

---

## 9. Key Findings

| Finding | Detail |
|---------|--------|
| **Baseline vibration** | ~0.30 g across all bridges, σ ≈ 0.087 |
| **Normal range** | 95% of readings fall within 0.15–0.45 g |
| **Warning threshold** | 0.8 g (2.9σ above mean) — conservative |
| **Critical threshold** | 1.2 g (10σ above mean) — rare events only |
| **Gap rate** | < 0.1% under normal sensor operation |
| **Trend** | Flat under normal conditions; slope > 1e-5 g/reading indicates sensor drift |

---

## 10. Next Steps

→ **Notebook 02** — Anomaly detection benchmarking (Z-score vs IQR vs combined)  
→ **Notebook 03** — RUL model calibration with historical fatigue data  
→ **Notebook 04** — Multi-bridge comparative health dashboard
