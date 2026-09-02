import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withClient } from "../lib/db";
import { isoWeekMonday } from "../lib/dates";

/**
 * CSV export for the office — pulls submissions from Postgres.
 *
 *   GET /api/export                      current week, both tabs concatenated
 *   GET /api/export?week=YYYY-MM-DD      specific ISO week
 *   GET /api/export?type=hours           only hours rows
 *   GET /api/export?type=inspections     only inspection rows
 *   GET /api/export?format=json          raw JSON instead of CSV
 *
 * Auth: same OFFICE_PIN as /api/submissions GET.
 *   Send as x-office-pin header  OR  ?pin=... query param.
 * If OFFICE_PIN env is not set, the endpoint is open (fine for early testing).
 */

const HOURS_HEADERS = [
  "Submission ID",
  "Submitted (UTC)",
  "Week of",
  "Operator",
  "Unit #",
  "Machine",
  "Type",
  "Hour meter",
  "Notes",
] as const;

const INSP_HEADERS = [
  "Submission ID",
  "Submitted (UTC)",
  "Week of",
  "Operator",
  "Unit #",
  "Machine",
  "Item",
  "Status",
  "Notes",
] as const;

interface DbRow {
  id: string | number;
  created_at: string | Date;
  week_of: string | Date;
  operator: string;
  hours: unknown;
  inspections: unknown;
}

interface HourItem {
  unitNumber?: string;
  machine?: string;
  type?: string;
  hourMeter?: number | string;
  notes?: string;
  operator?: string;
}

interface InspectionItem {
  unitNumber?: string;
  machine?: string;
  item?: string;
  status?: string;
  notes?: string;
  operator?: string;
}

function toIso(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : String(v);
}
function toDate(v: string | Date): string {
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 10);
}

function escapeCsv(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  // Excel/Sheets treat leading = + - @ as formula injection.
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

function rowsToCsv(headers: readonly string[], rows: string[][]): string {
  const bom = "\uFEFF";
  const lines = [headers.map(escapeCsv).join(",")];
  for (const r of rows) lines.push(r.map(escapeCsv).join(","));
  return bom + lines.join("\r\n") + "\r\n";
}

function officePinOk(req: VercelRequest): boolean {
  const expected = process.env.OFFICE_PIN?.trim();
  if (!expected) return true;
  const provided =
    (req.headers["x-office-pin"] as string | undefined)?.trim() ||
    (typeof req.query.pin === "string" ? req.query.pin.trim() : "");
  return provided === expected;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }
  if (!officePinOk(req)) {
    return res.status(401).json({ error: "invalid or missing x-office-pin" });
  }

  const weekParam = typeof req.query.week === "string" ? req.query.week : "";
  const week = /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : isoWeekMonday();
  const type = (typeof req.query.type === "string" ? req.query.type : "both").toLowerCase();
  const format = (typeof req.query.format === "string" ? req.query.format : "csv").toLowerCase();

  const rows = await withClient(async (c) => {
    const r = await c.query<DbRow>(
      `SELECT id, created_at, week_of, operator, hours, inspections
       FROM submissions WHERE week_of = $1 ORDER BY created_at ASC`,
      [week],
    );
    return r.rows;
  });

  // Flatten into two arrays of rows.
  const hoursRows: string[][] = [];
  const inspRows: string[][] = [];
  for (const s of rows) {
    const hs = Array.isArray(s.hours) ? (s.hours as HourItem[]) : [];
    const is = Array.isArray(s.inspections) ? (s.inspections as InspectionItem[]) : [];
    const submittedIso = toIso(s.created_at);
    const weekOf = toDate(s.week_of);
    for (const h of hs) {
      hoursRows.push([
        String(s.id),
        submittedIso,
        weekOf,
        h.operator || s.operator || "",
        h.unitNumber || "",
        h.machine || "",
        h.type || "",
        h.hourMeter !== undefined ? String(h.hourMeter) : "",
        h.notes || "",
      ]);
    }
    for (const i of is) {
      inspRows.push([
        String(s.id),
        submittedIso,
        weekOf,
        i.operator || s.operator || "",
        i.unitNumber || "",
        i.machine || "",
        i.item || "",
        i.status || "",
        i.notes || "",
      ]);
    }
  }

  if (format === "json") {
    return res.status(200).json({
      week_of: week,
      submissions: rows.length,
      hours: hoursRows.length,
      inspections: inspRows.length,
      hours_rows: hoursRows,
      inspection_rows: inspRows,
    });
  }

  const filenameBase = `sec-field-log-${week}`;
  let body: string;
  let filename: string;
  if (type === "hours") {
    body = rowsToCsv(HOURS_HEADERS, hoursRows);
    filename = `${filenameBase}-hours.csv`;
  } else if (type === "inspections" || type === "inspection") {
    body = rowsToCsv(INSP_HEADERS, inspRows);
    filename = `${filenameBase}-inspections.csv`;
  } else {
    // Both tabs: concatenate with a blank line and section headers.
    const parts = [
      `HOURS`,
      rowsToCsv(HOURS_HEADERS, hoursRows).trimEnd(),
      ``,
      `INSPECTIONS`,
      rowsToCsv(INSP_HEADERS, inspRows).trimEnd(),
    ];
    body = "\uFEFF" + parts.join("\r\n") + "\r\n";
    filename = `${filenameBase}.csv`;
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(body);
}
