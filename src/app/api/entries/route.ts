import { NextResponse } from "next/server";
import { createEntry, listEntries } from "@/lib/entries";
import {
  MAX_HOURS_PER_ENTRY,
  normalizeHours,
  normalizeWorkDate,
  type NewEntry,
} from "@/lib/entry-types";
import { appendEntryToSheet, sheetsConfigured } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ entries: await listEntries() });
}

export async function POST(request: Request) {
  let body: NewEntry;
  try {
    body = (await request.json()) as NewEntry;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.title || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (normalizeHours(body.hours) === null) {
    return NextResponse.json(
      { error: `hours must be a number between 0 and ${MAX_HOURS_PER_ENTRY}` },
      { status: 400 },
    );
  }

  if (normalizeWorkDate(body.work_date) === null) {
    return NextResponse.json(
      { error: "work_date must be a YYYY-MM-DD date" },
      { status: 400 },
    );
  }

  const entry = await createEntry(body);

  // Best-effort mirror to Google Sheets. If the sheet append fails we still
  // return 201 so the crew never sees an error for a saved entry — the row
  // will show up next time the admin runs a manual export from Postgres.
  let sheet: { synced: boolean; error?: string } = { synced: false };
  if (sheetsConfigured()) {
    try {
      await appendEntryToSheet(entry);
      sheet = { synced: true };
    } catch (err) {
      sheet = {
        synced: false,
        error: err instanceof Error ? err.message : "Sheet sync failed",
      };
      console.error("Sheet append failed:", err);
    }
  }

  return NextResponse.json({ entry, sheet }, { status: 201 });
}
