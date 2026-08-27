import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withClient } from "../lib/db";
import { isoWeekMonday } from "../lib/dates";
import {
  appendSubmissionToSheet,
  sheetsConfigured,
  type HoursRow,
  type InspectionRow,
} from "../lib/sheets";

/**
 * Field crew endpoint:
 *   POST /api/submissions       { operator, hours: [...], inspections: [...] }
 *
 * Office endpoint (gated by x-office-pin):
 *   GET  /api/submissions?week=YYYY-MM-DD   list submissions for the ISO week
 *   GET  /api/submissions?limit=50          list latest submissions
 */

interface HourEntry {
  unitNumber?: string;
  equipmentId?: string;
  machine?: string;
  name?: string;
  type?: string;
  hourMeter?: number | string;
  reading?: number | string;
  notes?: string;
  operator?: string;
}

interface InspectionEntry {
  unitNumber?: string;
  equipmentId?: string;
  machine?: string;
  name?: string;
  item?: string;
  label?: string;
  status?: string;
  result?: string;
  notes?: string;
  operator?: string;
}

interface SubmissionBody {
  operator?: string;
  weekOf?: string;
  hours?: HourEntry[];
  inspections?: InspectionEntry[];
}

function pickOperator(body: SubmissionBody): string {
  const fromBody = (body.operator ?? "").trim();
  if (fromBody) return fromBody;
  const fromHours = body.hours?.find((h) => h.operator?.trim())?.operator?.trim();
  if (fromHours) return fromHours;
  const fromInsp = body.inspections?.find((i) => i.operator?.trim())?.operator?.trim();
  return fromInsp || "Unknown";
}

function normalizeHours(items: HourEntry[] | undefined): {
  rows: HoursRow[];
  count: number;
} {
  const rows: HoursRow[] = [];
  const submittedIso = new Date().toISOString();
  for (const h of items ?? []) {
    const unit = (h.unitNumber ?? h.equipmentId ?? "").toString().trim();
    const reading = h.hourMeter ?? h.reading ?? "";
    if (!unit && reading === "") continue;
    rows.push({
      submittedIso,
      weekOf: "",
      operator: (h.operator ?? "").trim(),
      unitNumber: unit,
      machine: (h.machine ?? h.name ?? "").toString().trim(),
      type: (h.type ?? "").toString().trim(),
      hourMeter: typeof reading === "number" ? reading : String(reading),
      notes: (h.notes ?? "").toString().trim(),
    });
  }
  return { rows, count: rows.length };
}

function normalizeInspections(items: InspectionEntry[] | undefined): {
  rows: InspectionRow[];
  count: number;
  bad: number;
} {
  const rows: InspectionRow[] = [];
  let bad = 0;
  const submittedIso = new Date().toISOString();
  for (const i of items ?? []) {
    const unit = (i.unitNumber ?? i.equipmentId ?? "").toString().trim();
    const item = (i.item ?? i.label ?? "").toString().trim();
    const status = (i.status ?? i.result ?? "").toString().trim();
    if (!unit && !item) continue;
    if (/bad|fail|red/i.test(status)) bad++;
    rows.push({
      submittedIso,
      weekOf: "",
      operator: (i.operator ?? "").trim(),
      unitNumber: unit,
      machine: (i.machine ?? i.name ?? "").toString().trim(),
      item,
      status,
      notes: (i.notes ?? "").toString().trim(),
    });
  }
  return { rows, count: rows.length, bad };
}

function officePinOk(req: VercelRequest): boolean {
  const expected = process.env.OFFICE_PIN?.trim();
  if (!expected) return true; // no pin configured = office wide-open (fine for early testing)
  const provided =
    (req.headers["x-office-pin"] as string | undefined)?.trim() ||
    (typeof req.query.pin === "string" ? req.query.pin.trim() : "");
  return provided === expected;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-office-pin");
    return res.status(204).end();
  }

  if (req.method === "POST") {
    const body =
      typeof req.body === "string" ? (JSON.parse(req.body) as SubmissionBody) : (req.body ?? {});
    const operator = pickOperator(body);
    const weekOf = (body.weekOf && /^\d{4}-\d{2}-\d{2}$/.test(body.weekOf))
      ? body.weekOf
      : isoWeekMonday();

    const hours = normalizeHours(body.hours);
    const insp = normalizeInspections(body.inspections);
    hours.rows.forEach((r) => {
      r.weekOf = weekOf;
      if (!r.operator) r.operator = operator;
    });
    insp.rows.forEach((r) => {
      r.weekOf = weekOf;
      if (!r.operator) r.operator = operator;
    });

    // Persist to Postgres (source of truth)
    const id = await withClient(async (c) => {
      const result = await c.query(
        `INSERT INTO submissions (week_of, operator, hours, inspections,
           readings_count, inspections_count, bad_items_count, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          weekOf,
          operator,
          JSON.stringify(hours.rows),
          JSON.stringify(insp.rows),
          hours.count,
          insp.count,
          insp.bad,
          JSON.stringify(body),
        ],
      );
      return result.rows[0].id as string;
    });

    // Best-effort mirror to Google Sheets. Sheet failure never fails the field save.
    let sheet: { synced: boolean; hours?: number; inspections?: number; error?: string } = {
      synced: false,
    };
    if (sheetsConfigured()) {
      try {
        const summary = await appendSubmissionToSheet({
          hours: hours.rows,
          inspections: insp.rows,
        });
        sheet = { synced: true, ...summary };
      } catch (err) {
        sheet = { synced: false, error: err instanceof Error ? err.message : "sheet error" };
        console.error("Sheet append failed:", err);
      }
    }

    return res.status(201).json({
      ok: true,
      id,
      week_of: weekOf,
      operator,
      readings: hours.count,
      inspections: insp.count,
      badItems: insp.bad,
      sheet,
    });
  }

  if (req.method === "GET") {
    if (!officePinOk(req)) {
      return res.status(401).json({ error: "invalid or missing x-office-pin" });
    }
    const week = typeof req.query.week === "string" ? req.query.week : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 500);
    const rows = await withClient(async (c) => {
      if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
        const r = await c.query(
          `SELECT id, created_at, week_of, operator, hours, inspections,
            readings_count, inspections_count, bad_items_count
           FROM submissions WHERE week_of = $1 ORDER BY created_at DESC`,
          [week],
        );
        return r.rows;
      }
      const r = await c.query(
        `SELECT id, created_at, week_of, operator, hours, inspections,
          readings_count, inspections_count, bad_items_count
         FROM submissions ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return r.rows;
    });
    return res.status(200).json({ submissions: rows, count: rows.length });
  }

  res.setHeader("Allow", "GET, POST, OPTIONS");
  return res.status(405).json({ error: "method not allowed" });
}
