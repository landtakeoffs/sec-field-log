import { getAccessToken, googleAuthConfigured } from "./google-auth";

/**
 * Append rows to the shared Google Sheet whenever the crew submits.
 *
 * Env:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  - service account credentials
 *   GOOGLE_SHEET_ID              - sheet ID from the URL
 *   GOOGLE_SHEET_HOURS_TAB       - defaults to "Hours"
 *   GOOGLE_SHEET_INSPECTIONS_TAB - defaults to "Inspections"
 */

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export const HOURS_HEADERS = [
  "Submitted (UTC)",
  "Week of",
  "Operator",
  "Unit #",
  "Machine",
  "Type",
  "Hour meter",
  "Notes",
] as const;

export const INSPECTIONS_HEADERS = [
  "Submitted (UTC)",
  "Week of",
  "Operator",
  "Unit #",
  "Machine",
  "Item",
  "Status",
  "Notes",
] as const;

export function sheetsConfigured(): boolean {
  return googleAuthConfigured() && Boolean(process.env.GOOGLE_SHEET_ID?.trim());
}

export function sheetId(): string | null {
  return process.env.GOOGLE_SHEET_ID?.trim() || null;
}
export function hoursTab(): string {
  return process.env.GOOGLE_SHEET_HOURS_TAB?.trim() || "Hours";
}
export function inspectionsTab(): string {
  return process.env.GOOGLE_SHEET_INSPECTIONS_TAB?.trim() || "Inspections";
}
export function sheetLink(): string | null {
  const id = sheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

async function sheetsFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken(SHEETS_SCOPE);
  return fetch(`https://sheets.googleapis.com${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

async function ensureHeaders(id: string, tab: string, headers: readonly string[]): Promise<void> {
  const range = encodeURIComponent(`${tab}!A1:${String.fromCharCode(64 + headers.length)}1`);
  const get = await sheetsFetch(`/v4/spreadsheets/${id}/values/${range}`, { method: "GET" });
  if (!get.ok) {
    if (get.status === 400) {
      // Tab may not exist yet - create it via batchUpdate
      await sheetsFetch(`/v4/spreadsheets/${id}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
      });
    } else {
      throw new Error(`Sheet header check failed (${get.status}): ${await get.text()}`);
    }
  } else {
    const data = (await get.json()) as { values?: string[][] };
    if (data.values?.[0]?.[0] === headers[0]) return;
  }
  const put = await sheetsFetch(
    `/v4/spreadsheets/${id}/values/${range}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [headers] }) },
  );
  if (!put.ok) throw new Error(`Sheet header write failed (${put.status}): ${await put.text()}`);
}

async function appendRows(
  id: string,
  tab: string,
  headers: readonly string[],
  rows: (string | number)[][],
): Promise<void> {
  if (!rows.length) return;
  await ensureHeaders(id, tab, headers);
  const range = encodeURIComponent(`${tab}!A:${String.fromCharCode(64 + headers.length)}`);
  const res = await sheetsFetch(
    `/v4/spreadsheets/${id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: rows }) },
  );
  if (!res.ok) throw new Error(`Sheet append failed (${res.status}): ${await res.text()}`);
}

export interface HoursRow {
  submittedIso: string;
  weekOf: string;
  operator: string;
  unitNumber: string;
  machine: string;
  type: string;
  hourMeter: number | string;
  notes: string;
}
export interface InspectionRow {
  submittedIso: string;
  weekOf: string;
  operator: string;
  unitNumber: string;
  machine: string;
  item: string;
  status: string;
  notes: string;
}

export async function appendSubmissionToSheet(input: {
  hours: HoursRow[];
  inspections: InspectionRow[];
}): Promise<{ hours: number; inspections: number }> {
  const id = sheetId();
  if (!id) throw new SheetsNotConfiguredError();

  const hoursRows = input.hours.map((h) => [
    h.submittedIso,
    h.weekOf,
    h.operator,
    h.unitNumber,
    h.machine,
    h.type,
    h.hourMeter,
    h.notes,
  ]);
  const inspRows = input.inspections.map((i) => [
    i.submittedIso,
    i.weekOf,
    i.operator,
    i.unitNumber,
    i.machine,
    i.item,
    i.status,
    i.notes,
  ]);

  await appendRows(id, hoursTab(), HOURS_HEADERS, hoursRows);
  await appendRows(id, inspectionsTab(), INSPECTIONS_HEADERS, inspRows);
  return { hours: hoursRows.length, inspections: inspRows.length };
}

export class SheetsNotConfiguredError extends Error {
  constructor() {
    super("Google Sheet not configured (GOOGLE_SHEET_ID missing).");
    this.name = "SheetsNotConfiguredError";
  }
}
