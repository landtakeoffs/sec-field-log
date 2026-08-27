"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { addDays, localTodayIsoDate, weekRangeFor } from "@/lib/dates";
import {
  MAX_HOURS_PER_ENTRY,
  SEVERITIES,
  effectiveWorkDate,
  type Entry,
  type Severity,
} from "@/lib/entry-types";
import { formatHours, sumHours, totalsByWorker } from "@/lib/timesheet";

const severityStyles: Record<Severity, string> = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

const inputClasses =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950";

function formatRange(start: string, end: string): string {
  return `${start} → ${end}`;
}

const noopSubscribe = () => () => {};

/**
 * The crew's own calendar date. Server-rendered markup gets an empty string so
 * the prerendered page never bakes in a stale or wrong-timezone date.
 */
function useLocalToday(): string {
  return useSyncExternalStore(noopSubscribe, localTodayIsoDate, () => "");
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [title, setTitle] = useState("");
  const [worker, setWorker] = useState("");
  const [hours, setHours] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState<Severity>("low");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useLocalToday();
  // Both default to today until the user picks something else.
  const [pickedWorkDate, setPickedWorkDate] = useState<string | null>(null);
  const [pickedWeek, setPickedWeek] = useState<string | null>(null);
  const workDate = pickedWorkDate ?? today;
  const weekAnchor = pickedWeek ?? today;

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/entries");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setError("Failed to load entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/entries");
        const data = await res.json();
        if (active) setEntries(data.entries ?? []);
      } catch {
        if (active) setError("Failed to load entries");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const week = useMemo(
    () => (weekAnchor ? weekRangeFor(weekAnchor) : null),
    [weekAnchor],
  );

  const weekEntries = useMemo(() => {
    if (!week) return [];
    return entries.filter((entry) => {
      const date = effectiveWorkDate(entry);
      return date >= week.start && date <= week.end;
    });
  }, [entries, week]);

  const weekTotals = useMemo(() => totalsByWorker(weekEntries), [weekEntries]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!worker.trim()) {
      setError("Worker name is required so the office knows whose hours these are");
      return;
    }
    const parsedHours = Number(hours);
    if (!hours.trim() || !Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError("Enter the hours worked as a number greater than 0");
      return;
    }
    if (parsedHours > MAX_HOURS_PER_ENTRY) {
      setError(`Hours cannot exceed ${MAX_HOURS_PER_ENTRY} for a single entry`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          worker,
          work_date: workDate,
          hours: parsedHours,
          location,
          severity,
          notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save entry");
      }
      setTitle("");
      setHours("");
      setLocation("");
      setSeverity("low");
      setNotes("");
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Security Field Log
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Log hours worked alongside field observations, then download the week
          as a spreadsheet for the office to review.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mb-10 grid gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="grid gap-1">
            <label htmlFor="worker" className="text-sm font-medium">
              Worker
            </label>
            <input
              id="worker"
              value={worker}
              onChange={(e) => setWorker(e.target.value)}
              placeholder="e.g. J. Alvarez"
              className={inputClasses}
            />
          </div>

          <div className="grid gap-1">
            <label htmlFor="work-date" className="text-sm font-medium">
              Date worked
            </label>
            <input
              id="work-date"
              type="date"
              value={workDate}
              onChange={(e) => setPickedWorkDate(e.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="grid gap-1">
            <label htmlFor="hours" className="text-sm font-medium">
              Hours
            </label>
            <input
              id="hours"
              type="number"
              inputMode="decimal"
              min={0}
              max={MAX_HOURS_PER_ENTRY}
              step={0.25}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 8"
              className={inputClasses}
            />
          </div>
        </div>

        <div className="grid gap-1">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Overnight patrol — Building C"
            className={inputClasses}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <label htmlFor="location" className="text-sm font-medium">
              Location
            </label>
            <input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Building C, Floor 2"
              className={inputClasses}
            />
          </div>

          <div className="grid gap-1">
            <label htmlFor="severity" className="text-sm font-medium">
              Severity
            </label>
            <select
              id="severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className={inputClasses}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-1">
          <label htmlFor="notes" className="text-sm font-medium">
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Additional details…"
            className={inputClasses}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {submitting ? "Saving…" : "Add entry"}
          </button>
        </div>
      </form>

      <section className="mb-10 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Weekly hours</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {week ? formatRange(week.start, week.end) : "Loading week…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPickedWeek(addDays(weekAnchor, -7))}
              disabled={!weekAnchor}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-700"
              aria-label="Previous week"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setPickedWeek(null)}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700"
            >
              This week
            </button>
            <button
              type="button"
              onClick={() => setPickedWeek(addDays(weekAnchor, 7))}
              disabled={!weekAnchor}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-700"
              aria-label="Next week"
            >
              ›
            </button>
          </div>
        </div>

        <p className="mt-4 text-2xl font-semibold" data-testid="week-total">
          {formatHours(sumHours(weekEntries))} hours
        </p>

        {weekTotals.length > 0 && (
          <ul className="mt-3 grid gap-1 text-sm text-neutral-600 dark:text-neutral-400">
            {weekTotals.map((total) => (
              <li key={total.worker} className="flex justify-between gap-4">
                <span>{total.worker}</span>
                <span>{formatHours(total.hours)} h</span>
              </li>
            ))}
          </ul>
        )}

        <a
          href={week ? `/api/timesheet?week=${week.start}` : undefined}
          aria-disabled={!week}
          className="mt-5 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium transition hover:bg-neutral-100 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Download spreadsheet (CSV)
        </a>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Entries</h2>
          <span className="text-sm text-neutral-500" data-testid="entry-count">
            {entries.length} total
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No entries yet. Add your first field log above.
          </p>
        ) : (
          <ul className="grid gap-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium">{entry.title}</h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium dark:border-neutral-700">
                      {formatHours(entry.hours)} h
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${severityStyles[entry.severity]}`}
                    >
                      {entry.severity}
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {effectiveWorkDate(entry)}
                  {entry.worker ? ` · ${entry.worker}` : ""}
                  {entry.location ? ` · ${entry.location}` : ""}
                </div>
                {entry.notes && (
                  <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                    {entry.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
