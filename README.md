# SEC Field Tool

Mobile field app for SEC Construction. Crew logs machine hours and weekly
equipment inspections; every submission saves to Postgres and appends to a
shared Google Sheet the office can watch live.

## Architecture

- **Frontend** – recovered branded PWA (Vite build) served as static from repo root.
- **Backend** – Vercel serverless functions in `/api`.
  - `POST /api/submissions` – field crew submits hours + inspections.
  - `GET  /api/submissions?week=YYYY-MM-DD` – office review (gated by `x-office-pin`).
  - `GET  /api/status` – non-secret config flags.
- **Storage** – Postgres (`submissions` table, auto-created on first write).
- **Live sheet** – Google Sheets service-account append on every save.

## Required Vercel env vars

| Key | Purpose |
|---|---|
| `DATABASE_URL` or `POSTGRES_URL` | Postgres connection string |
| `OFFICE_PIN` | Header value office must send to read submissions (`x-office-pin`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service-account credential JSON (paste whole file) |
| `GOOGLE_SHEET_ID` | Target sheet ID from its URL |
| `GOOGLE_SHEET_HOURS_TAB` | Optional, defaults to `Hours` |
| `GOOGLE_SHEET_INSPECTIONS_TAB` | Optional, defaults to `Inspections` |

Share the sheet with the service-account email (`client_email`) as **Editor**.
