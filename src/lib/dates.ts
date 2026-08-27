const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Work dates are plain `YYYY-MM-DD` calendar strings entered by whoever logged
 * the hours, so all arithmetic here is calendar arithmetic done in UTC. That
 * keeps a week's boundaries identical no matter which timezone the office or
 * the field crew is in.
 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  return toDate(value) !== null;
}

function toDate(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = toDate(value);
  if (!date) {
    throw new Error(`Invalid date: ${value}`);
  }
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function dayLabel(value: string): string {
  const date = toDate(value);
  return date ? DAY_LABELS[date.getUTCDay()] : "";
}

export interface DateRange {
  start: string;
  end: string;
}

/** Monday-to-Sunday week containing `value`. */
export function weekRangeFor(value: string): DateRange {
  const date = toDate(value);
  if (!date) {
    throw new Error(`Invalid date: ${value}`);
  }
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const start = addDays(value, -daysSinceMonday);
  return { start, end: addDays(start, 6) };
}

export function todayIsoDate(): string {
  return formatDate(new Date());
}

/**
 * Today in the viewer's own timezone. Only safe to call in the browser, since
 * a server-rendered value would disagree with the client and break hydration.
 */
export function localTodayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
