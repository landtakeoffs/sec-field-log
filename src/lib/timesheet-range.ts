import { isValidDateString, todayIsoDate, weekRangeFor, type DateRange } from "./dates";

export function parseTimesheetRange(params: URLSearchParams):
  | { ok: true; range: DateRange }
  | { ok: false; error: string } {
  const start = params.get("start");
  const end = params.get("end");
  const week = params.get("week");

  if (start || end) {
    if (!isValidDateString(start) || !isValidDateString(end)) {
      return { ok: false, error: "start and end must both be YYYY-MM-DD dates" };
    }
    if (start > end) {
      return { ok: false, error: "start must be on or before end" };
    }
    return { ok: true, range: { start, end } };
  }

  if (week !== null && !isValidDateString(week)) {
    return { ok: false, error: "week must be a YYYY-MM-DD date" };
  }

  return { ok: true, range: weekRangeFor(week ?? todayIsoDate()) };
}
