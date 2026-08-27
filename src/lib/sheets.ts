import { dayLabel } from "./dates";
import { effectiveWorkDate, type Entry } from "./entry-types";
import { formatHours } from "./timesheet";
import {
  GoogleAuthNotConfiguredError,
  getAccessToken,
  googleAuthConfigured,
} from "./google-auth";

/**
 * Append one field-log entry as a new row in the shared Google Sheet.
 *
 * Env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  – service-account credentials JSON
 *   GOOGLE_SHEET_ID              – the sheet ID (from the URL, between /d/ and /edit)
 *   GOOGLE_SHEET_TAB             – optional tab name (defaults to "Hours")
 *
 * The sheet must be shared with the service account's client_email (Editor).
 */

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_TAB = "Hours";

export const SHEET_HEADERS = [
  "Date",
  "Day",
  "Worker",
  "Hours",
  "Location",
  "Entry",
  "Severity",
  "Notes",
  "Submitted (UTC)",
] as const;

export function sheetsConfigured(): boolean {
  return googleAuthConfigured() && Boolean(process.env.GOOGLE_SHEET_ID?.trim());
}

export function sheetId(): string | null {
  return process.env.GOOGLE_SHEET_ID?.trim() || null;
}

export function sheetTab(): string {
  return process.env.GOOGLE_SHEET_TAB?.trim() || DEFAULT_TAB;
}

export function sheetLink(): string | null {
  const id = sheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

function entryToRow(entry: Entry): (string | number)[] {
  const workDate = effectiveWorkDate(entry);
  return [
    workDate,
    dayLabel(workDate),
    entry.worker || "Unassigned",
    Number(formatHours(entry.hours)),
    entry.location || "",
    entry.title,
    entry.severity,
    entry.notes.replaceAll("\r\n", "\n"),
    entry.created_at,
  ];
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

/** Idempotently ensure the header row is present. Cheap: reads A1:I1 first. */
async function ensureHeaders(id: string, tab: string): Promise<void> {
  const range = encodeURIComponent(`${tab}!A1:I1`);
  const getRes = await sheetsFetch(
    `/v4/spreadsheets/${id}/values/${range}`,
    { method: "GET" },
  );
  if (!getRes.ok) {
    const detail = await getRes.text().catch(() => "");
    throw new SheetsError(`Sheet header check failed (${getRes.status})`, getRes.status, detail);
  }
  const data = (await getRes.json()) as { values?: string[][] };
  const firstRow = data.values?.[0] ?? [];
  if (firstRow.length && firstRow[0] === SHEET_HEADERS[0]) return;

  const putRes = await sheetsFetch(
    `/v4/spreadsheets/${id}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [SHEET_HEADERS] }),
    },
  );
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => "");
    throw new SheetsError(`Sheet header write failed (${putRes.status})`, putRes.status, detail);
  }
}

export async function appendEntryToSheet(entry: Entry): Promise<{ range: string }> {
  if (!googleAuthConfigured()) throw new GoogleAuthNotConfiguredError();
  const id = sheetId();
  if (!id) throw new SheetsNotConfiguredError();

  const tab = sheetTab();
  await ensureHeaders(id, tab);

  const range = encodeURIComponent(`${tab}!A:I`);
  const res = await sheetsFetch(
    `/v4/spreadsheets/${id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [entryToRow(entry)] }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new SheetsError(`Sheet append failed (${res.status})`, res.status, detail);
  }
  const data = (await res.json()) as { updates?: { updatedRange?: string } };
  return { range: data.updates?.updatedRange ?? `${tab}!A:I` };
}

export class SheetsNotConfiguredError extends Error {
  constructor() {
    super("Google Sheet not configured. Set GOOGLE_SHEET_ID.");
    this.name = "SheetsNotConfiguredError";
  }
}

export class SheetsError extends Error {
  status: number;
  detail: string;
  constructor(message: string, status: number, detail: string) {
    super(message);
    this.name = "SheetsError";
    this.status = status;
    this.detail = detail;
  }
}
