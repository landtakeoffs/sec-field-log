import { NextResponse } from "next/server";
import { createEntry, listEntries } from "@/lib/entries";
import type { NewEntry } from "@/lib/entry-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ entries: listEntries() });
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

  const entry = createEntry(body);
  return NextResponse.json({ entry }, { status: 201 });
}
