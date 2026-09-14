/**
 * ARIA Bridge Health Monitoring — Utility Functions
 * Formatting, logging, date/time helpers, unit conversions.
 */

// ─── Date / Time ──────────────────────────────────────────────────────────────

/**
 * Format an ISO timestamp as a human-readable local string.
 * e.g. "2025-07-14T10:32:00Z" → "14 Jul 2025, 10:32:00 UTC"
 */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toUTCString().replace("GMT", "UTC");
}

/**
 * Elapsed time in human-readable form.
 * e.g. 90061 → "1 day, 1 hour, 1 minute, 1 second"
 */
export function humanDuration(seconds: number): string {
  if (seconds < 0) return "0 seconds";

  const parts: string[] = [];
  const intervals: [number, string][] = [
    [86400, "day"],
    [3600,  "hour"],
    [60,    "minute"],
    [1,     "second"],
  ];

  let remaining = Math.floor(seconds);
  for (const [secs, label] of intervals) {
    const count = Math.floor(remaining / secs);
    remaining %= secs;
    if (count > 0) parts.push(`${count} ${label}${count !== 1 ? "s" : ""}`);
  }

  return parts.length ? parts.join(", ") : "0 seconds";
}

/**
 * Days between two dates (|a - b|).
 */
export function daysBetween(a: Date | string, b: Date | string = new Date()): number {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return Math.abs(Math.floor((db.getTime() - da.getTime()) / 86_400_000));
}

/**
 * Return a Date that is `days` days in the future (or past if negative).
 */
export function addDays(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── Numeric formatting ───────────────────────────────────────────────────────

/**
 * Round a number to `decimals` decimal places.
 */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Clamp a value within [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between a and b at position t (0–1).
 */
export function lerp(a: number, b: number, t: number): number {
  return a + clamp(t, 0, 1) * (b - a);
}

/**
 * Format a number with comma thousands separators.
 * e.g. 1234567.89 → "1,234,567.89"
 */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a percentage (0–1 input) → "42.5%"
 */
export function formatPercent(fraction: number, decimals = 1): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

// ─── Unit conversions ─────────────────────────────────────────────────────────

/** Celsius → Fahrenheit */
export const celsiusToFahrenheit = (c: number): number => c * 9 / 5 + 32;

/** Fahrenheit → Celsius */
export const fahrenheitToCelsius = (f: number): number => (f - 32) * 5 / 9;

/** mm/year → inches/year */
export const mmPerYearToInchPerYear = (mm: number): number => mm / 25.4;

/** kN → kip (1 kip = 4.44822 kN) */
export const kNToKip = (kn: number): number => kn / 4.44822;

/** MPa → psi */
export const mpaToPsi = (mpa: number): number => mpa * 145.038;

// ─── String helpers ───────────────────────────────────────────────────────────

/**
 * Capitalise the first letter of every word.
 */
export function titleCase(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Truncate a string to `maxLen` characters, appending "…" if cut.
 */
export function truncate(str: string, maxLen = 80): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

/**
 * Pad a string on the right to `width` characters.
 */
export function padRight(str: string, width: number, fill = " "): string {
  return str.padEnd(width, fill);
}

// ─── Logger ───────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "[DBG]",
  info:  "[INF]",
  warn:  "[WRN]",
  error: "[ERR]",
};

const LEVEL_COLOURS: Record<LogLevel, string> = {
  debug: "\x1b[2m",    // dim
  info:  "\x1b[36m",   // cyan
  warn:  "\x1b[33m",   // yellow
  error: "\x1b[31m",   // red
};

const RESET = "\x1b[0m";

export class Logger {
  private minLevel: LogLevel;
  private prefix: string;

  constructor(prefix = "ARIA", minLevel: LogLevel = "info") {
    this.prefix   = prefix;
    this.minLevel = minLevel;
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    const ts    = new Date().toISOString();
    const label = LEVEL_LABELS[level];
    const color = LEVEL_COLOURS[level];
    const line  = `${color}${ts} ${label} [${this.prefix}] ${message}${RESET}`;

    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }

    if (meta !== undefined) {
      console.log(JSON.stringify(meta, null, 2));
    }
  }

  debug(message: string, meta?: unknown): void { this.log("debug", message, meta); }
  info (message: string, meta?: unknown): void { this.log("info",  message, meta); }
  warn (message: string, meta?: unknown): void { this.log("warn",  message, meta); }
  error(message: string, meta?: unknown): void { this.log("error", message, meta); }

  /** Return a child logger with an extended prefix. */
  child(name: string): Logger {
    return new Logger(`${this.prefix}:${name}`, this.minLevel);
  }
}

/** Singleton root logger. */
export const logger = new Logger("ARIA");

// ─── Object helpers ───────────────────────────────────────────────────────────

/**
 * Pick a subset of keys from an object.
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) result[k] = obj[k];
  return result;
}

/**
 * Omit keys from an object.
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const k of keys) delete (result as Record<string, unknown>)[k as string];
  return result as Omit<T, K>;
}

/**
 * Deep-clone a plain JSON-serialisable value.
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// ─── Array helpers ────────────────────────────────────────────────────────────

/**
 * Return the arithmetic mean of a numeric array.
 */
export function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * Return the sample standard deviation.
 */
export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.map(v => (v - m) ** 2).reduce((a, b) => a + b, 0) / (arr.length - 1));
}

/**
 * Return the minimum value in an array.
 */
export function min(arr: number[]): number {
  return arr.length ? Math.min(...arr) : NaN;
}

/**
 * Return the maximum value in an array.
 */
export function max(arr: number[]): number {
  return arr.length ? Math.max(...arr) : NaN;
}

/**
 * Return the p-th percentile (0–100) of a numeric array.
 */
export function percentile(arr: number[], p: number): number {
  if (!arr.length) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const index  = (p / 100) * (sorted.length - 1);
  const lower  = Math.floor(index);
  const upper  = Math.ceil(index);
  return lerp(sorted[lower], sorted[upper], index - lower);
}

/**
 * Group array elements by a key function.
 */
export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] = acc[key] ?? []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
