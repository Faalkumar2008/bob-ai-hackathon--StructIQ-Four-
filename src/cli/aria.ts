/**
 * ARIA Bridge Health Monitoring — CLI Entry Point
 * Usage: ts-node src/cli/aria.ts <command> [options]
 *
 * Commands
 * --------
 *  analyse   --bridge <id> [--sensor <type>] [--value <n>] [--unit <u>]
 *  health    --bridge <id> --readings <json-file>
 *  anomaly   --bridge <id> --sensor <type> --values <csv-numbers> [--sensitivity low|medium|high]
 *  rul       --bridge <id> --model fatigue|corrosion|settlement --current <n> [--rate <n>] [--threshold <n>]
 *  schedule  --bridge <id> --score <n> --last-inspection <YYYY-MM-DD>
 *  registry  [--id <bridge-id>]
 *  help
 */

import fs   from "fs";
import path from "path";

// ─── Tiny arg parser ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else if (!args["_command"]) {
      args["_command"] = arg;
    }
  }
  return args;
}

// ─── Colour helpers (ANSI) ───────────────────────────────────────────────────

const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  red:     "\x1b[31m",
  yellow:  "\x1b[33m",
  green:   "\x1b[32m",
  cyan:    "\x1b[36m",
  magenta: "\x1b[35m",
  dim:     "\x1b[2m",
};

function statusColour(status: string): string {
  switch (status.toLowerCase()) {
    case "normal": case "good": case "low":    return c.green;
    case "warning": case "fair": case "medium":return c.yellow;
    case "critical": case "poor": case "high": return c.red;
    default: return c.reset;
  }
}

function printJSON(obj: unknown): void {
  const text = JSON.stringify(obj, null, 2);
  // Highlight keys in cyan, string values in green, numbers in magenta
  const coloured = text
    .replace(/"([^"]+)":/g,   `${c.cyan}"$1"${c.reset}:`)
    .replace(/: "([^"]*)"/g,  `: ${c.green}"$1"${c.reset}`)
    .replace(/: (-?\d+\.?\d*)/g, `: ${c.magenta}$1${c.reset}`);
  console.log(coloured);
}

// ─── Bridge registry ──────────────────────────────────────────────────────────

const REGISTRY: Record<string, { name: string; location: string; yearBuilt: number; type: string }> = {
  "BRG-001": { name: "Golden Gate Replica", location: "San Francisco, CA", yearBuilt: 1937, type: "suspension" },
  "BRG-002": { name: "Harbor Crossing",     location: "New York, NY",      yearBuilt: 1965, type: "cable-stayed" },
  "BRG-003": { name: "River Valley Bridge", location: "Portland, OR",      yearBuilt: 1989, type: "beam" },
  "BRG-004": { name: "Mountain Pass Span",  location: "Denver, CO",        yearBuilt: 2002, type: "arch" },
  "BRG-005": { name: "Coastal Connector",   location: "Miami, FL",         yearBuilt: 1978, type: "truss" },
};

// ─── Command implementations ──────────────────────────────────────────────────

function cmdAnalyse(args: Record<string, string | boolean>): void {
  const bridgeId  = args["bridge"] as string;
  const sensorType = args["sensor"] as string ?? "vibration";
  const value      = parseFloat(args["value"] as string ?? "0.5");
  const unit       = args["unit"] as string ?? "g";

  if (!bridgeId) { console.error(`${c.red}Error: --bridge <id> is required${c.reset}`); process.exit(1); }

  const thresholds: Record<string, { warning: number; critical: number }> = {
    vibration:   { warning: 0.8,  critical: 1.2  },
    strain:      { warning: 450,  critical: 600  },
    temperature: { warning: 60,   critical: 80   },
    displacement:{ warning: 25,   critical: 40   },
    corrosion:   { warning: 0.15, critical: 0.30 },
    load:        { warning: 3200, critical: 4000 },
  };

  const t = thresholds[sensorType.toLowerCase()];
  let status = "normal";
  if (t) {
    if (value >= t.critical) status = "critical";
    else if (value >= t.warning) status = "warning";
  }

  const sc = statusColour(status);
  console.log(`\n${c.bold}ARIA Sensor Analysis${c.reset}`);
  console.log(`Bridge   : ${c.cyan}${bridgeId}${c.reset} — ${REGISTRY[bridgeId]?.name ?? "Unknown"}`);
  console.log(`Sensor   : ${sensorType}`);
  console.log(`Reading  : ${c.magenta}${value} ${unit}${c.reset}`);
  console.log(`Status   : ${sc}${c.bold}${status.toUpperCase()}${c.reset}`);
  if (t) {
    console.log(`Threshold: warning=${t.warning}, critical=${t.critical}`);
  }
  console.log(`Time     : ${new Date().toISOString()}\n`);
}

function cmdRegistry(args: Record<string, string | boolean>): void {
  const id = args["id"] as string;
  if (id) {
    const bridge = REGISTRY[id];
    if (!bridge) { console.error(`${c.red}Bridge ${id} not found${c.reset}`); process.exit(1); }
    console.log(`\n${c.bold}Bridge ${id}${c.reset}`);
    Object.entries({ id, ...bridge }).forEach(([k, v]) =>
      console.log(`  ${c.cyan}${k.padEnd(12)}${c.reset}: ${v}`));
    console.log();
  } else {
    console.log(`\n${c.bold}ARIA Bridge Registry (${Object.keys(REGISTRY).length} bridges)${c.reset}\n`);
    console.log(`${"ID".padEnd(10)} ${"Name".padEnd(25)} ${"Type".padEnd(14)} ${"Built".padEnd(6)} Location`);
    console.log("─".repeat(80));
    for (const [id, b] of Object.entries(REGISTRY)) {
      console.log(`${c.cyan}${id.padEnd(10)}${c.reset} ${b.name.padEnd(25)} ${b.type.padEnd(14)} ${b.yearBuilt}  ${b.location}`);
    }
    console.log();
  }
}

function cmdRUL(args: Record<string, string | boolean>): void {
  const bridgeId = args["bridge"]    as string;
  const model    = (args["model"]    as string ?? "fatigue") as "fatigue" | "corrosion" | "settlement";
  const current  = parseFloat(args["current"]   as string ?? "0");
  const rate     = parseFloat(args["rate"]      as string ?? "0");
  const threshold = parseFloat(args["threshold"] as string ?? "0");

  if (!bridgeId) { console.error(`${c.red}Error: --bridge is required${c.reset}`); process.exit(1); }

  const defaults: Record<string, { threshold: number; rate: number; unit: string }> = {
    fatigue:    { threshold: 1_000_000, rate: 1_000,  unit: "cycles" },
    corrosion:  { threshold: 0.5,       rate: 0.02,   unit: "years"  },
    settlement: { threshold: 50,        rate: 0.5,    unit: "years"  },
  };

  const d = defaults[model];
  const effectiveThreshold = threshold || d.threshold;
  const effectiveRate      = rate      || d.rate;
  const remaining          = Math.max(0, effectiveThreshold - current);
  const rul                = effectiveRate > 0 ? remaining / effectiveRate : Infinity;
  const urgency            = rul < 1 ? "Critical" : rul < 5 ? "High" : rul < 20 ? "Medium" : "Low";

  console.log(`\n${c.bold}ARIA Remaining Useful Life — ${model.toUpperCase()}${c.reset}`);
  console.log(`Bridge   : ${c.cyan}${bridgeId}${c.reset}`);
  console.log(`Current  : ${c.magenta}${current}${c.reset} / ${effectiveThreshold} (threshold)`);
  console.log(`Rate     : ${effectiveRate} per ${d.unit}`);
  console.log(`RUL      : ${c.bold}${isFinite(rul) ? Math.round(rul) : "∞"} ${d.unit}${c.reset}`);
  console.log(`Urgency  : ${statusColour(urgency)}${urgency}${c.reset}\n`);
}

function cmdAnomalyDetect(args: Record<string, string | boolean>): void {
  const bridgeId   = args["bridge"]      as string;
  const sensorType = args["sensor"]      as string ?? "vibration";
  const valuesCSV  = args["values"]      as string ?? "";
  const sensitivity = (args["sensitivity"] as string ?? "medium") as "low" | "medium" | "high";

  if (!bridgeId) { console.error(`${c.red}Error: --bridge is required${c.reset}`); process.exit(1); }
  if (!valuesCSV) { console.error(`${c.red}Error: --values <csv> is required${c.reset}`); process.exit(1); }

  const values = valuesCSV.split(",").map(Number).filter(n => !isNaN(n));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std  = Math.sqrt(values.map(v => (v - mean) ** 2).reduce((a, b) => a + b, 0) / values.length);
  const zThr = sensitivity === "low" ? 3.5 : sensitivity === "high" ? 2.0 : 2.5;
  const anomalies = values.filter(v => std > 0 && Math.abs(v - mean) / std > zThr);

  const risk = anomalies.length > values.length * 0.1 ? "High"
             : anomalies.length > 0 ? "Medium" : "Low";

  console.log(`\n${c.bold}ARIA Anomaly Detection${c.reset}`);
  console.log(`Bridge   : ${c.cyan}${bridgeId}${c.reset}`);
  console.log(`Sensor   : ${sensorType} (sensitivity: ${sensitivity})`);
  console.log(`Readings : ${values.length} values | mean=${mean.toFixed(3)} σ=${std.toFixed(3)}`);
  console.log(`Anomalies: ${statusColour(risk)}${anomalies.length} found (${((anomalies.length / values.length) * 100).toFixed(1)}%)${c.reset}`);
  console.log(`Risk     : ${statusColour(risk)}${risk}${c.reset}\n`);
  if (anomalies.length) {
    console.log(`Anomalous values: ${c.red}${anomalies.join(", ")}${c.reset}\n`);
  }
}

function cmdSchedule(args: Record<string, string | boolean>): void {
  const bridgeId       = args["bridge"]          as string;
  const score          = parseFloat(args["score"] as string ?? "75");
  const lastInspection = args["last-inspection"]  as string ?? "2024-01-01";

  if (!bridgeId) { console.error(`${c.red}Error: --bridge is required${c.reset}`); process.exit(1); }

  const daysAgo = Math.floor((Date.now() - new Date(lastInspection).getTime()) / 86400000);
  const priority = score < 40 ? "Critical" : score < 60 ? "High" : score < 80 ? "Medium" : "Low";
  const nextDays = score >= 80 ? 365 : score >= 60 ? 90 : 14;

  console.log(`\n${c.bold}ARIA Maintenance Schedule${c.reset}`);
  console.log(`Bridge        : ${c.cyan}${bridgeId}${c.reset}`);
  console.log(`Health Score  : ${statusColour(priority)}${score}/100 (${priority} priority)${c.reset}`);
  console.log(`Last Inspection: ${lastInspection} (${daysAgo} days ago)`);
  console.log(`Next Inspection: ${new Date(Date.now() + nextDays * 86400000).toISOString().split("T")[0]}`);
  console.log(`\nRecommended tasks:`);

  if (score < 40) {
    console.log(`  ${c.red}[CRITICAL]${c.reset} Emergency structural inspection — Within 48 hours`);
    console.log(`  ${c.red}[CRITICAL]${c.reset} Load restriction implementation — Immediate`);
  } else if (score < 60) {
    console.log(`  ${c.yellow}[HIGH]${c.reset} Comprehensive bridge inspection — Within 2 weeks`);
    console.log(`  ${c.yellow}[HIGH]${c.reset} Structural reinforcement assessment — Within 1 month`);
  } else if (score < 80) {
    console.log(`  ${c.yellow}[MEDIUM]${c.reset} Routine visual inspection — Within 3 months`);
    console.log(`  ${c.dim}[LOW]${c.reset} Sensor calibration check — Within 6 months`);
  } else {
    console.log(`  ${c.dim}[LOW]${c.reset} Annual structural inspection — Within 12 months`);
    console.log(`  ${c.dim}[LOW]${c.reset} Preventive coating inspection — Within 18 months`);
  }
  console.log();
}

function cmdHelp(): void {
  console.log(`
${c.bold}${c.cyan}ARIA — Bridge Health Monitoring CLI${c.reset}
${c.dim}AI-powered Realtime Infrastructure Analyser${c.reset}

${c.bold}Usage:${c.reset}
  ts-node src/cli/aria.ts <command> [options]

${c.bold}Commands:${c.reset}
  ${c.cyan}analyse${c.reset}   Analyse a single sensor reading
    --bridge <id>        Bridge ID (e.g. BRG-001)
    --sensor <type>      Sensor type: vibration|strain|temperature|displacement|corrosion|load
    --value  <n>         Numeric reading value
    --unit   <u>         Unit (e.g. g, MPa, °C, mm)

  ${c.cyan}registry${c.reset}  List all registered bridges
    --id <id>            Show details for a single bridge

  ${c.cyan}anomaly${c.reset}   Detect anomalies in a series of values
    --bridge <id>
    --sensor <type>
    --values <csv>       Comma-separated numeric values
    --sensitivity        low|medium|high  (default: medium)

  ${c.cyan}rul${c.reset}       Predict remaining useful life
    --bridge <id>
    --model              fatigue|corrosion|settlement
    --current <n>        Current deterioration value
    --rate    <n>        Deterioration rate per unit time (optional)
    --threshold <n>      Failure threshold (optional — uses model default)

  ${c.cyan}schedule${c.reset}  Generate maintenance schedule
    --bridge <id>
    --score  <n>         Current health score (0–100)
    --last-inspection    Last inspection date (YYYY-MM-DD)

  ${c.cyan}help${c.reset}      Show this help

${c.bold}Examples:${c.reset}
  ts-node src/cli/aria.ts analyse  --bridge BRG-001 --sensor vibration --value 0.9 --unit g
  ts-node src/cli/aria.ts registry
  ts-node src/cli/aria.ts anomaly  --bridge BRG-002 --sensor strain --values 300,310,295,850,305
  ts-node src/cli/aria.ts rul      --bridge BRG-003 --model corrosion --current 0.12
  ts-node src/cli/aria.ts schedule --bridge BRG-001 --score 55 --last-inspection 2024-06-01
`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const command = args["_command"] as string;

switch (command) {
  case "analyse":  cmdAnalyse(args);       break;
  case "registry": cmdRegistry(args);      break;
  case "anomaly":  cmdAnomalyDetect(args); break;
  case "rul":      cmdRUL(args);           break;
  case "schedule": cmdSchedule(args);      break;
  case "help":
  case undefined:
  default:
    cmdHelp();
}
