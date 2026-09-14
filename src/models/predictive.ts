/**
 * ============================================================
 * src/models/predictive.ts
 * ARIA — Predictive Remaining Useful Life (RUL) Models
 * ============================================================
 *
 * Three physics-based degradation models:
 *
 *   1. FATIGUE    — Paris-law / Miner's rule (crack propagation)
 *   2. CORROSION  — Faraday's law (cover depletion rate)
 *   3. SETTLEMENT — Linear regression (displacement trend)
 *
 * All models return a standardised RULResult object.
 *
 * References:
 *   - Paris & Erdogan (1963) — fatigue crack growth law
 *   - Faraday's law of electrolysis — corrosion kinetics
 *   - AASHTO LRFD §2.5 — serviceability deflection limits
 * ============================================================
 */

import { NormalisedReading } from "../data/ingest.js";

// ─── Types ───────────────────────────────────────────────────

export type ModelType = "fatigue" | "corrosion" | "settlement";
export type Component = "deck" | "bearing" | "cable" | "pier" | "girder" | "rebar";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface RULResult {
  bridge_id: string;
  component: Component;
  model_type: ModelType;
  bridge_age_years: number;
  estimated_rul_years: number;
  confidence_level: ConfidenceLevel;
  degradation_rate: number;
  degradation_unit: string;
  percent_life_consumed: number;
  model_notes: string;
  recommendation: string;
  analysis_time: string;
}

// ─── Model 1: Fatigue — Paris-Law / Miner's Rule ─────────────
//
// D = Σ(ni / Ni) where ni = applied cycles, Ni = cycles to failure
// Simplified: D = (age × cycles/day × 365) / (design_life_cycles)
// RUL = (1 - D) × design_life_years

export interface FatigueParams {
  bridgeId: string;
  component: Component;
  ageYears: number;
  loadCyclesPerDay?: number;    // default: 5000
  designLifeYears?: number;     // default: 75
  referenceAgeYears?: number;   // calibration baseline (default: 50)
}

export function fatigueRUL(params: FatigueParams): RULResult {
  const {
    bridgeId,
    component,
    ageYears,
    loadCyclesPerDay = 5000,
    designLifeYears = 75,
    referenceAgeYears = 50,
  } = params;

  const totalDesignCycles = referenceAgeYears * 5000 * 365;
  const appliedCycles = ageYears * loadCyclesPerDay * 365;
  const fatigueConsumed = Math.min(1, appliedCycles / totalDesignCycles);
  const remaining = Math.max(0, 1 - fatigueConsumed);
  const rul = Math.round(remaining * designLifeYears);

  const confidence: ConfidenceLevel =
    remaining > 0.5 ? "HIGH" : remaining > 0.2 ? "MEDIUM" : "LOW";

  return {
    bridge_id: bridgeId,
    component,
    model_type: "fatigue",
    bridge_age_years: ageYears,
    estimated_rul_years: rul,
    confidence_level: confidence,
    degradation_rate: Math.round((fatigueConsumed / ageYears) * 1000) / 1000,
    degradation_unit: "Miner's damage fraction per year",
    percent_life_consumed: Math.round(fatigueConsumed * 1000) / 10,
    model_notes: `Paris-law model. ${loadCyclesPerDay.toLocaleString()} cycles/day. `
      + `Design life: ${designLifeYears} yrs. `
      + `Fatigue consumed: ${(fatigueConsumed * 100).toFixed(1)}%. `
      + `Reference: Paris & Erdogan (1963) / AASHTO LRFD Appendix A6.`,
    recommendation: rulRecommendation(rul),
    analysis_time: new Date().toISOString(),
  };
}

// ─── Model 2: Corrosion — Faraday Cover Depletion ────────────
//
// Corrosion rate (mm/year) derived from half-cell potential (mV CSE):
//   < -500 mV → 0.25 mm/yr (severe)
//   < -350 mV → 0.12 mm/yr (active)
//   ≥ -350 mV → 0.04 mm/yr (passive)
//
// RUL = (cover_remaining - min_cover) / rate
// where cover_remaining = cover_depth - (age × rate)

export interface CorrosionParams {
  bridgeId: string;
  component: Component;
  ageYears: number;
  sensors: NormalisedReading[];
  coverDepthMm?: number;        // default: 40 mm (typical concrete cover)
  minCoverMm?: number;          // default: 15 mm (structural threshold)
}

export function corrosionRUL(params: CorrosionParams): RULResult {
  const {
    bridgeId,
    component,
    ageYears,
    sensors,
    coverDepthMm = 40,
    minCoverMm = 15,
  } = params;

  const corrSensor = sensors.find((s) => s.sensor_type === "corrosion");
  const potential = corrSensor ? corrSensor.value : -300; // default: passive

  const rate =
    potential < -500 ? 0.25 :
    potential < -350 ? 0.12 :
    0.04; // mm/year

  const coverConsumed = ageYears * rate;
  const coverRemaining = coverDepthMm - coverConsumed;
  const rul = Math.max(0, Math.round((coverRemaining - minCoverMm) / rate));
  const pctConsumed = Math.min(100, Math.round((coverConsumed / (coverDepthMm - minCoverMm)) * 1000) / 10);

  const confidence: ConfidenceLevel =
    rul > 20 ? "HIGH" : rul > 5 ? "MEDIUM" : "LOW";

  return {
    bridge_id: bridgeId,
    component,
    model_type: "corrosion",
    bridge_age_years: ageYears,
    estimated_rul_years: rul,
    confidence_level: confidence,
    degradation_rate: rate,
    degradation_unit: "mm/year (rebar cover depletion)",
    percent_life_consumed: pctConsumed,
    model_notes: `Faraday model. Half-cell potential: ${potential} mV (CSE). `
      + `Corrosion rate: ${rate} mm/yr. `
      + `Cover remaining: ${Math.max(0, coverRemaining).toFixed(1)} mm. `
      + `Minimum structural cover: ${minCoverMm} mm. `
      + `Reference: ASTM C876 / Faraday's law of electrolysis.`,
    recommendation: rulRecommendation(rul),
    analysis_time: new Date().toISOString(),
  };
}

// ─── Model 3: Settlement — Linear Displacement Trend ─────────
//
// rate = current_displacement / bridge_age  (mm/year)
// limit = span_m / 360  (L/360 AASHTO serviceability limit)
// RUL = (limit - current_displacement) / rate

export interface SettlementParams {
  bridgeId: string;
  component: Component;
  ageYears: number;
  spanMetres: number;
  sensors: NormalisedReading[];
  deflectionFraction?: number; // default: 360 (L/360)
}

export function settlementRUL(params: SettlementParams): RULResult {
  const {
    bridgeId,
    component,
    ageYears,
    spanMetres,
    sensors,
    deflectionFraction = 360,
  } = params;

  const dispSensor = sensors.find((s) => s.sensor_type === "displacement");
  const currentDisp = dispSensor ? dispSensor.value : spanMetres / 720; // default half-limit

  const maxAllowable = (spanMetres * 1000) / deflectionFraction; // convert m to mm
  const rate = ageYears > 0 ? currentDisp / ageYears : 0.1; // mm/year
  const rul = rate > 0
    ? Math.max(0, Math.round((maxAllowable - currentDisp) / rate))
    : 999;

  const pctConsumed = Math.round((currentDisp / maxAllowable) * 1000) / 10;

  const confidence: ConfidenceLevel =
    rul > 20 ? "HIGH" : rul > 5 ? "MEDIUM" : "LOW";

  return {
    bridge_id: bridgeId,
    component,
    model_type: "settlement",
    bridge_age_years: ageYears,
    estimated_rul_years: rul,
    confidence_level: confidence,
    degradation_rate: Math.round(rate * 100) / 100,
    degradation_unit: "mm/year (vertical settlement rate)",
    percent_life_consumed: pctConsumed,
    model_notes: `Linear settlement model. Rate: ${rate.toFixed(2)} mm/yr. `
      + `Current displacement: ${currentDisp} mm. `
      + `L/${deflectionFraction} serviceability limit: ${maxAllowable.toFixed(1)} mm. `
      + `Reference: AASHTO LRFD §2.5.2.`,
    recommendation: rulRecommendation(rul),
    analysis_time: new Date().toISOString(),
  };
}

// ─── Recommendation text from RUL years ──────────────────────

function rulRecommendation(rul: number): string {
  if (rul <= 5)  return "CRITICAL: Schedule urgent structural assessment and rehabilitation planning immediately.";
  if (rul <= 15) return "HIGH: Include component in next capital maintenance programme within 12 months.";
  if (rul <= 30) return "MEDIUM: Monitor closely and plan preventive maintenance within 3 years.";
  return "LOW: Continue routine monitoring as per current inspection programme.";
}

// ─── Run all three models for a bridge ───────────────────────

export function runAllModels(
  bridgeId: string,
  component: Component,
  ageYears: number,
  spanMetres: number,
  sensors: NormalisedReading[]
): RULResult[] {
  return [
    fatigueRUL({ bridgeId, component, ageYears }),
    corrosionRUL({ bridgeId, component, ageYears, sensors }),
    settlementRUL({ bridgeId, component, ageYears, spanMetres, sensors }),
  ];
}
