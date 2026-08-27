import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listEntriesInRange } from "@/lib/entries";
import { EmailNotConfiguredError, emailConfigured, sendWeeklyEmail } from "@/lib/email";
import { parseTimesheetRange } from "@/lib/timesheet-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send the weekly summary email. Two entry points:
 *   POST /api/timesheet/email             – manual trigger from the UI
 *   GET  /api/timesheet/email?token=...   – cron trigger (Vercel Cron / external)
 *
 * Optional CRON_SECRET env var: if set, the cron GET must present it as
 *   ?token=<value>  OR  Authorization: Bearer <value>
 */

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return true; // no secret configured = open
  const token =
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return token === expected;
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = parseTimesheetRange(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const entries = await listEntriesInRange(parsed.range.start, parsed.range.end);
  try {
    await sendWeeklyEmail(parsed.range, entries);
    return NextResponse.json({
      sent: true,
      range: parsed.range,
      entries: entries.length,
    });
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, configured: emailConfigured() },
        { status: 503 },
      );
    }
    throw err;
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
