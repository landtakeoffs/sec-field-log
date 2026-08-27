# sec-field-log

Security Field Log — a small [Next.js](https://nextjs.org) app for logging
field hours and observations. Each entry records who worked, the date worked,
hours, plus the observation itself (title, location, severity, notes), and is
persisted to a local SQLite database via
[`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3).

## Weekly hours spreadsheet

The home page shows the selected week's total hours with a per-worker
breakdown, and **Download spreadsheet (CSV)** saves that week as a CSV file
that opens directly in Excel, Numbers, or Google Sheets — one row per entry,
with per-worker subtotals and a grand total at the bottom.

Weeks run Monday to Sunday. The same export is available directly:

```bash
# The week containing a given date (defaults to the current week)
curl -OJ 'http://localhost:3000/api/timesheet?week=2026-08-27'

# An explicit date range
curl -OJ 'http://localhost:3000/api/timesheet?start=2026-08-01&end=2026-08-31'
```

Work dates are plain calendar dates, so a week's boundaries are the same
regardless of the timezone the office or the field crew is in.

## Getting started

```bash
npm install        # install dependencies (compiles the native SQLite module)
npm run dev        # start the dev server on http://localhost:3000
```

Then open [http://localhost:3000](http://localhost:3000) and add a field log
entry.

## Scripts

| Command         | Description                                  |
| --------------- | -------------------------------------------- |
| `npm run dev`   | Start the development server (port 3000).    |
| `npm run build` | Create a production build.                   |
| `npm run start` | Run the production server.                   |
| `npm run lint`  | Run ESLint.                                  |

## Project layout

- `src/app/page.tsx` — the field log UI (form, weekly hours, list).
- `src/app/api/entries/route.ts` — `GET`/`POST` API for entries.
- `src/app/api/timesheet/route.ts` — weekly hours CSV export.
- `src/lib/db.ts` — SQLite connection, schema, and migrations.
- `src/lib/entries.ts` — entry data access helpers.
- `src/lib/dates.ts` — calendar-date and week arithmetic.
- `src/lib/timesheet.ts` — hours totals and CSV generation.

The SQLite file lives at `data/field-log.db` and is gitignored.
