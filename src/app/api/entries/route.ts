import { NextResponse } from "next/server";
import { createEntry, listEntries } from "@/lib/entries";
import {
  MAX_HOURS_PER_ENTRY,
  normalizeHours,
  normalizeWorkDate,
  type NewEntry,
} from "@/lib/entry-types";

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
  return NextResponse.json({ entry }, { status: 201 });
}
