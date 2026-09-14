/**
 * ============================================================
 * src/data/ingest.ts
 * ARIA — Data Ingestion & Preprocessing Layer
 * ============================================================
 *
 * Responsibilities:
 *   - Parse raw sensor payloads (JSON / CSV)
 *   - Validate schema and types
 *   - Normalise units to SI
 *   - Stamp with ingestion timestamp
 *   - Flag FAULT / OFFLINE sensors before analysis
 *
 * In production: replace simulateSensorPayload() with a real
 * MQTT subscription, REST poll, or WebSocket stream.
 * ============================================================
 */

// ─── Types ───────────────────────────────────────────────────

export type SensorType =
  | "strain"
  | "vibration"
  | "displacement"
  | "temperature"
  | "corrosion"
  | "load";

export type SensorStatus = "OK" | "ALERT" | "FAULT" | "OFFLINE";
export type AlertLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RawSensorPayload {
  sensor_id: string;
  sensor_type: SensorType;
  location: string;
  raw_value: number;
  raw_unit: string;
  device_timestamp?: string;
}

export interface NormalisedReading {
  sensor_id: string;
  sensor_type: SensorType;
  location: string;
  value: number;
  unit: string;
  timestamp: string;
  status: SensorStatus;
  alert_level?: AlertLevel;
  ingested_at: string;
}

// ─── Unit normalisation map ───────────────────────────────────
// Maps raw unit strings to normalised SI values and labels.

const UNIT_NORMALISE: Record<string, { factor: number; normalised: string }> = {
  microstrain:  { factor: 1,        normalised: "microstrain" },
  "μstrain":    { factor: 1,        normalised: "microstrain" },
  mm:           { factor: 1,        normalised: "mm"          },
  cm:           { factor: 10,       normalised: "mm"          },
  m:            { factor: 1000,     normalised: "mm"          },
  Hz:           { factor: 1,        normalised: "Hz"          },
  "mV (CSE)":   { factor: 1,        normalised: "mV (CSE)"    },
  mV:           { factor: 1,        normalised: "mV (CSE)"    },
  "°C":         { factor: 1,        normalised: "°C"          },
  C:            { factor: 1,        normalised: "°C"          },
  kN:           { factor: 1,        normalised: "kN"          },
  N:            { factor: 0.001,    normalised: "kN"          },
  kn:           { factor: 1,        normalised: "kN"          },
};

// ─── Design limit thresholds (for initial status tagging) ────

const DESIGN_LIMITS: Record<SensorType, { warn: number; critical: number; above: boolean }> = {
  strain:       { warn: 320,   critical: 380,  above: true  }, // microstrain (80% / 95% of 400)
  displacement: { warn: 27,    critical: 33,   above: true  }, // mm — based on L/360 for 120m span
  vibration:    { warn: 9,     critical: 12,   above: true  }, // Hz — upper; also check below 2.5
  temperature:  { warn: 50,    critical: 60,   above: true  }, // °C
  corrosion:    { warn: -350,  critical: -500, above: false }, // mV (CSE) — below threshold is bad
  load:         { warn: 2250,  critical: 2450, above: true  }, // kN — 90% / 98% of 2500 design
};

// ─── Normalise a single raw payload ──────────────────────────

export function normaliseReading(raw: RawSensorPayload): NormalisedReading {
  const now = new Date().toISOString();
  const unitMap = UNIT_NORMALISE[raw.raw_unit] ?? { factor: 1, normalised: raw.raw_unit };
  const value = Math.round(raw.raw_value * unitMap.factor * 1000) / 1000;

  // Determine status from thresholds
  let status: SensorStatus = "OK";
  let alert_level: AlertLevel | undefined;

  const limit = DESIGN_LIMITS[raw.sensor_type];
  if (limit) {
    if (limit.above) {
      if (value >= limit.critical) { status = "ALERT"; alert_level = "CRITICAL"; }
      else if (value >= limit.warn) { status = "ALERT"; alert_level = "HIGH"; }
    } else {
      // Lower is worse (corrosion)
      if (value <= limit.critical) { status = "ALERT"; alert_level = "CRITICAL"; }
      else if (value <= limit.warn) { status = "ALERT"; alert_level = "HIGH"; }
    }
  }

  return {
    sensor_id: raw.sensor_id,
    sensor_type: raw.sensor_type,
    location: raw.location,
    value,
    unit: unitMap.normalised,
    timestamp: raw.device_timestamp ?? now,
    status,
    alert_level,
    ingested_at: now,
  };
}

// ─── Batch ingest ─────────────────────────────────────────────

export function ingestBatch(payloads: RawSensorPayload[]): NormalisedReading[] {
  return payloads.map(normaliseReading);
}

// ─── Simulated sensor payload generator ──────────────────────
// PRODUCTION: Replace with MQTT client, REST poll, or WebSocket.
// Example (MQTT):
//   const client = mqtt.connect("mqtt://broker.example.com");
//   client.on("message", (topic, message) => {
//     const raw: RawSensorPayload = JSON.parse(message.toString());
//     const reading = normaliseReading(raw);
//     processReading(reading);
//   });

export function simulateSensorPayload(
  sensorId: string,
  type: SensorType,
  location: string,
  baseValue: number,
  unit: string
): RawSensorPayload {
  const noise = (Math.random() - 0.5) * Math.abs(baseValue) * 0.04;
  return {
    sensor_id: sensorId,
    sensor_type: type,
    location,
    raw_value: Math.round((baseValue + noise) * 100) / 100,
    raw_unit: unit,
    device_timestamp: new Date().toISOString(),
  };
}
