import { dayLabel, type DateRange } from "./dates";
import { effectiveWorkDate, type Entry } from "./entry-types";

const CSV_COLUMNS = [
  "Date",
  "Day",
  "Worker",
  "Hours",
  "Location",
  "Entry",
  "Severity",
  "Notes",
  "Logged (UTC)",
] as const;

const HOURS_COLUMN_INDEX = 3;

export function formatHours(hours: number): string {
  return String(Math.round(hours * 100) / 100);
}

export function sumHours(entries: Entry[]): number {
  return Math.round(entries.reduce((total, entry) => total + entry.hours, 0) * 100) / 100;
}

export interface WorkerTotal {
  worker: string;
  hours: number;
}

export function totalsByWorker(entries: Entry[]): WorkerTotal[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const worker = entry.worker || "Unassigned";
    totals.set(worker, (totals.get(worker) ?? 0) + entry.hours);
  }
  return [...totals.entries()]
    .map(([worker, hours]) => ({ worker, hours: Math.round(hours * 100) / 100 }))
    .sort((a, b) => a.worker.localeCompare(b.worker));
}

function escapeField(value: string): string {
  // Excel and Google Sheets both treat a leading =, +, - or @ as a formula.
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

function toCsv(rows: string[][]): string {
  // CRLF plus a BOM is what makes Excel open the file with correct encoding.
  return `\uFEFF${rows.map((row) => row.map(escapeField).join(",")).join("\r\n")}\r\n`;
}

function padRow(cells: string[]): string[] {
  return [...cells, ...Array(Math.max(0, CSV_COLUMNS.length - cells.length)).fill("")];
}

export function buildTimesheetCsv(entries: Entry[]): string {
  const rows: string[][] = [[...CSV_COLUMNS]];

  for (const entry of entries) {
    const workDate = effectiveWorkDate(entry);
    rows.push([
      workDate,
      dayLabel(workDate),
      entry.worker,
      formatHours(entry.hours),
      entry.location,
      entry.title,
      entry.severity,
      entry.notes.replaceAll("\r\n", "\n"),
      entry.created_at,
    ]);
  }

  rows.push(padRow([]));
  rows.push(padRow(["Total by worker"]));
  for (const { worker, hours } of totalsByWorker(entries)) {
    const row = padRow([worker]);
    row[HOURS_COLUMN_INDEX] = formatHours(hours);
    rows.push(row);
  }

  const totalRow = padRow(["All workers"]);
  totalRow[HOURS_COLUMN_INDEX] = formatHours(sumHours(entries));
  rows.push(totalRow);

  return toCsv(rows);
}

export function timesheetFileName(range: DateRange): string {
  return `field-log-hours-${range.start}-to-${range.end}.csv`;
}
