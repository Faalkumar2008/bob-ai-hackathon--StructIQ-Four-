/**
 * ARIA Bridge Health Monitoring — Core Library
 * Shared logic: bridge registry, health scoring engine, alert bus.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Bridge {
  id: string;
  name: string;
  location: string;
  yearBuilt: number;
  type: BridgeType;
  span: number;        // metres
  maxLoad: number;     // kN
  sensors: string[];   // sensor types installed
}

export type BridgeType = "suspension" | "cable-stayed" | "beam" | "arch" | "truss" | "cantilever";

export interface SensorReading {
  bridgeId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface HealthScore {
  bridgeId: string;
  score: number;        // 0–100
  condition: "Good" | "Fair" | "Poor" | "Critical";
  trend: "improving" | "stable" | "degrading";
  components: Record<string, number>;
  computedAt: string;
}

export interface Alert {
  bridgeId: string;
  sensorType: string;
  severity: "info" | "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
  triggeredAt: string;
}

// ─── Static bridge registry ───────────────────────────────────────────────────

const BRIDGES: Bridge[] = [
  {
    id: "BRG-001", name: "Golden Gate Replica", location: "San Francisco, CA",
    yearBuilt: 1937, type: "suspension",   span: 1280, maxLoad: 4000,
    sensors: ["vibration", "strain", "temperature", "displacement", "load"],
  },
  {
    id: "BRG-002", name: "Harbor Crossing",     location: "New York, NY",
    yearBuilt: 1965, type: "cable-stayed", span:  420, maxLoad: 2500,
    sensors: ["vibration", "strain", "corrosion", "temperature"],
  },
  {
    id: "BRG-003", name: "River Valley Bridge", location: "Portland, OR",
    yearBuilt: 1989, type: "beam",         span:   85, maxLoad: 1800,
    sensors: ["vibration", "displacement", "load", "temperature"],
  },
  {
    id: "BRG-004", name: "Mountain Pass Span",  location: "Denver, CO",
    yearBuilt: 2002, type: "arch",         span:  210, maxLoad: 3200,
    sensors: ["vibration", "strain", "temperature", "displacement"],
  },
  {
    id: "BRG-005", name: "Coastal Connector",   location: "Miami, FL",
    yearBuilt: 1978, type: "truss",        span:  340, maxLoad: 2200,
    sensors: ["vibration", "corrosion", "strain", "temperature", "load"],
  },
];

// ─── BridgeRegistry ──────────────────────────────────────────────────────────

export class BridgeRegistry {
  private static readonly data: Map<string, Bridge> =
    new Map(BRIDGES.map(b => [b.id, b]));

  /** Return a bridge by ID, or undefined. */
  static get(id: string): Bridge | undefined {
    return this.data.get(id);
  }

  /** Return all bridges. */
  static all(): Bridge[] {
    return Array.from(this.data.values());
  }

  /** Return bridges whose sensors include the given type. */
  static withSensor(sensorType: string): Bridge[] {
    return this.all().filter(b => b.sensors.includes(sensorType));
  }

  /** How old is the bridge (years)? */
  static age(id: string): number {
    const b = this.get(id);
    return b ? new Date().getFullYear() - b.yearBuilt : 0;
  }
}

// ─── Threshold map ────────────────────────────────────────────────────────────

const THRESHOLDS: Record<string, { warning: number; critical: number; unit: string }> = {
  vibration:    { warning: 0.8,  critical: 1.2,  unit: "g"   },
  strain:       { warning: 450,  critical: 600,  unit: "MPa" },
  temperature:  { warning: 60,   critical: 80,   unit: "°C"  },
  displacement: { warning: 25,   critical: 40,   unit: "mm"  },
  corrosion:    { warning: 0.15, critical: 0.30, unit: "mm/yr" },
  load:         { warning: 3200, critical: 4000, unit: "kN"  },
};

export function getThreshold(sensorType: string) {
  return THRESHOLDS[sensorType.toLowerCase()] ?? null;
}

// ─── HealthScoringEngine ──────────────────────────────────────────────────────

/**
 * Sensor weights for the composite health score.
 * Must sum to 1.0 across the set of sensors that produce readings.
 */
const SENSOR_WEIGHTS: Record<string, number> = {
  vibration:    0.25,
  strain:       0.30,
  displacement: 0.20,
  corrosion:    0.15,
  temperature:  0.05,
  load:         0.05,
};

export class HealthScoringEngine {
  /**
   * Compute a composite health score (0–100) from a batch of sensor readings.
   * Readings from different sensors are weighted; multiple readings from the
   * same sensor are averaged first.
   */
  static compute(readings: SensorReading[]): HealthScore {
    if (!readings.length) {
      return {
        bridgeId: "unknown", score: 75, condition: "Fair", trend: "stable",
        components: {}, computedAt: new Date().toISOString(),
      };
    }

    const bridgeId = readings[0].bridgeId;

    // Group by sensor type
    const byType = new Map<string, number[]>();
    for (const r of readings) {
      const key = r.sensorType.toLowerCase();
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key)!.push(r.value);
    }

    const components: Record<string, number> = {};
    let weightedScore = 0;
    let totalWeight   = 0;

    for (const [type, values] of byType.entries()) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const t   = THRESHOLDS[type];
      let score = 100;
      if (t) {
        if (avg >= t.critical)    score = 10;
        else if (avg >= t.warning) score = 55;
        else {
          // Linear scale between 0 and warning → 100 down to 60
          const ratio = avg / t.warning;
          score = 100 - (ratio * 40);
        }
      }
      const w = SENSOR_WEIGHTS[type] ?? 0.1;
      components[type] = Math.round(score);
      weightedScore += score * w;
      totalWeight   += w;
    }

    const score     = Math.round(totalWeight > 0 ? weightedScore / totalWeight : 75);
    const condition = score >= 80 ? "Good" : score >= 60 ? "Fair" : score >= 40 ? "Poor" : "Critical";

    // Trend: compare first and last halves
    const half  = Math.floor(readings.length / 2);
    const first = readings.slice(0, half).map(r => r.value);
    const last  = readings.slice(half).map(r => r.value);
    const avgFirst = first.length ? first.reduce((a, b) => a + b, 0) / first.length : 0;
    const avgLast  = last.length  ? last.reduce((a, b) => a + b, 0)  / last.length  : 0;
    const trend: HealthScore["trend"] = avgLast > avgFirst * 1.05 ? "degrading"
                                      : avgLast < avgFirst * 0.95 ? "improving" : "stable";

    return { bridgeId, score, condition, trend, components, computedAt: new Date().toISOString() };
  }
}

// ─── AlertBus ─────────────────────────────────────────────────────────────────

type AlertHandler = (alert: Alert) => void;

export class AlertBus {
  private static handlers: AlertHandler[] = [];

  /** Register a callback that fires on every new alert. */
  static subscribe(handler: AlertHandler): void {
    this.handlers.push(handler);
  }

  /** Evaluate a reading against thresholds and emit alerts if needed. */
  static evaluate(reading: SensorReading): Alert | null {
    const t = THRESHOLDS[reading.sensorType.toLowerCase()];
    if (!t) return null;

    let severity: Alert["severity"] | null = null;
    let threshold = 0;

    if (reading.value >= t.critical) {
      severity  = "critical";
      threshold = t.critical;
    } else if (reading.value >= t.warning) {
      severity  = "warning";
      threshold = t.warning;
    }

    if (!severity) return null;

    const alert: Alert = {
      bridgeId:   reading.bridgeId,
      sensorType: reading.sensorType,
      severity,
      message:    `${reading.sensorType} reading ${reading.value}${t.unit} exceeds ${severity} threshold (${threshold}${t.unit})`,
      value:      reading.value,
      threshold,
      triggeredAt: reading.timestamp,
    };

    this.handlers.forEach(h => h(alert));
    return alert;
  }

  /** Remove all subscribers (useful in tests). */
  static clear(): void {
    this.handlers = [];
  }
}
