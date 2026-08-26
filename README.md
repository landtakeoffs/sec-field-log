# sec-field-log

Security Field Log — a small [Next.js](https://nextjs.org) app for recording
and reviewing field observations and incidents. Entries (title, location,
severity, notes) are persisted to a local SQLite database via
[`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3).

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

- `src/app/page.tsx` — the field log UI (form + list).
- `src/app/api/entries/route.ts` — `GET`/`POST` API for entries.
- `src/lib/db.ts` — SQLite connection and schema.
- `src/lib/entries.ts` — entry data access helpers.

The SQLite file lives at `data/field-log.db` and is gitignored.
