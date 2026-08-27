import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DropboxNotConfiguredError,
  DropboxUploadError,
  dropboxConfigured,
  dropboxFolder,
  uploadTimesheetToDropbox,
} from "@/lib/dropbox";
import { listEntriesInRange } from "@/lib/entries";
import { buildTimesheetCsv, timesheetFileName } from "@/lib/timesheet";
import { parseTimesheetRange } from "@/lib/timesheet-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weekly hours as a spreadsheet download.
 *
 * `?week=YYYY-MM-DD` exports the Monday-to-Sunday week containing that date
 * (defaulting to the current week), and `?start=`/`?end=` export an explicit
 * range. The client sends its own local date so the "current week" matches the
 * crew's calendar rather than the server's.
 */
export async function GET(request: NextRequest) {
  const parsed = parseTimesheetRange(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const csv = buildTimesheetCsv(listEntriesInRange(parsed.range.start, parsed.range.end));

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${timesheetFileName(parsed.range)}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Overwrite the selected week's spreadsheet in the office Dropbox folder.
 * Requires DROPBOX_ACCESS_TOKEN. The same week query params as GET apply.
 */
export async function POST(request: NextRequest) {
  const parsed = parseTimesheetRange(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const csv = buildTimesheetCsv(listEntriesInRange(parsed.range.start, parsed.range.end));

  try {
    const uploaded = await uploadTimesheetToDropbox(csv, parsed.range);
    return NextResponse.json({
      folder: dropboxFolder(),
      ...uploaded,
    });
  } catch (error) {
    if (error instanceof DropboxNotConfiguredError) {
      return NextResponse.json(
        {
          error: error.message,
          folder: dropboxFolder(),
          configured: dropboxConfigured(),
        },
        { status: 503 },
      );
    }
    if (error instanceof DropboxUploadError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
