import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidDateString, todayIsoDate, weekRangeFor } from "@/lib/dates";
import { listEntriesInRange } from "@/lib/entries";
import { buildTimesheetCsv, timesheetFileName } from "@/lib/timesheet";

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
  const params = request.nextUrl.searchParams;
  const start = params.get("start");
  const end = params.get("end");
  const week = params.get("week");

  let range: { start: string; end: string };

  if (start || end) {
    if (!isValidDateString(start) || !isValidDateString(end)) {
      return NextResponse.json(
        { error: "start and end must both be YYYY-MM-DD dates" },
        { status: 400 },
      );
    }
    if (start > end) {
      return NextResponse.json(
        { error: "start must be on or before end" },
        { status: 400 },
      );
    }
    range = { start, end };
  } else {
    if (week !== null && !isValidDateString(week)) {
      return NextResponse.json(
        { error: "week must be a YYYY-MM-DD date" },
        { status: 400 },
      );
    }
    range = weekRangeFor(week ?? todayIsoDate());
  }

  const csv = buildTimesheetCsv(listEntriesInRange(range.start, range.end));

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${timesheetFileName(range)}"`,
      "Cache-Control": "no-store",
    },
  });
}
