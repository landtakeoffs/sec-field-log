import { dayLabel, type DateRange } from "./dates";
import { effectiveWorkDate, type Entry } from "./entry-types";
import { buildTimesheetCsv, formatHours, sumHours, timesheetFileName, totalsByWorker } from "./timesheet";
import { sheetLink } from "./sheets";

/**
 * Send the weekly hours summary to the admin using SendGrid.
 *
 * Env vars:
 *   SENDGRID_API_KEY    – SG.* key with Mail Send permission
 *   EMAIL_FROM          – verified sender (e.g. "SEC Field Log <log@your-domain.com>")
 *   EMAIL_TO            – comma-separated admin recipients
 *   EMAIL_CC (optional) – comma-separated cc recipients
 */

export function emailConfigured(): boolean {
  return Boolean(
    process.env.SENDGRID_API_KEY?.trim() &&
      process.env.EMAIL_FROM?.trim() &&
      process.env.EMAIL_TO?.trim(),
  );
}

function parseList(value: string | undefined): { email: string }[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

function fromField(): { email: string; name?: string } {
  const raw = (process.env.EMAIL_FROM ?? "").trim();
  const match = raw.match(/^(.*?)<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim() || undefined, email: match[2].trim() };
  return { email: raw };
}

function summaryHtml(range: DateRange, entries: Entry[]): string {
  const totals = totalsByWorker(entries);
  const total = sumHours(entries);
  const link = sheetLink();
  const rows = entries
    .slice()
    .sort((a, b) => effectiveWorkDate(a).localeCompare(effectiveWorkDate(b)))
    .map((e) => {
      const d = effectiveWorkDate(e);
      return `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${d} (${dayLabel(d)})</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(e.worker || "Unassigned")}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${formatHours(e.hours)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(e.title)}</td>
      </tr>`;
    })
    .join("");
  const totalsRows = totals
    .map(
      (t) =>
        `<tr><td style="padding:4px 8px">${escapeHtml(t.worker)}</td><td style="padding:4px 8px;text-align:right">${formatHours(t.hours)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111">
  <h2 style="margin:0 0 4px">SEC Weekly Equipment Log</h2>
  <p style="margin:0 0 12px;color:#555">${range.start} → ${range.end}</p>
  ${link ? `<p><a href="${link}">Open the live sheet</a></p>` : ""}
  <h3 style="margin:16px 0 4px">Totals</h3>
  <table style="border-collapse:collapse;min-width:280px">
    <thead><tr><th style="text-align:left;padding:4px 8px">Worker</th><th style="text-align:right;padding:4px 8px">Hours</th></tr></thead>
    <tbody>${totalsRows || `<tr><td colspan="2" style="padding:4px 8px;color:#888">No entries</td></tr>`}</tbody>
    <tfoot><tr><td style="padding:4px 8px;font-weight:600;border-top:1px solid #ccc">All workers</td><td style="padding:4px 8px;text-align:right;font-weight:600;border-top:1px solid #ccc">${formatHours(total)}</td></tr></tfoot>
  </table>
  <h3 style="margin:20px 0 4px">Entries</h3>
  <table style="border-collapse:collapse;min-width:520px">
    <thead><tr><th style="text-align:left;padding:4px 8px">Date</th><th style="text-align:left;padding:4px 8px">Worker</th><th style="text-align:right;padding:4px 8px">Hours</th><th style="text-align:left;padding:4px 8px">Entry</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" style="padding:4px 8px;color:#888">No entries this week</td></tr>`}</tbody>
  </table>
  <p style="margin-top:16px;color:#888;font-size:12px">Attached: ${timesheetFileName(range)}</p>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendWeeklyEmail(range: DateRange, entries: Entry[]): Promise<void> {
  if (!emailConfigured()) throw new EmailNotConfiguredError();

  const csv = buildTimesheetCsv(entries);
  const attachment = {
    content: Buffer.from(csv, "utf8").toString("base64"),
    filename: timesheetFileName(range),
    type: "text/csv",
    disposition: "attachment",
  };

  const to = parseList(process.env.EMAIL_TO);
  const cc = parseList(process.env.EMAIL_CC);
  const from = fromField();

  const payload = {
    personalizations: [
      {
        to,
        ...(cc.length ? { cc } : {}),
        subject: `SEC Weekly Equipment Log — ${range.start} → ${range.end}`,
      },
    ],
    from,
    content: [{ type: "text/html", value: summaryHtml(range, entries) }],
    attachments: [attachment],
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 202) {
    const detail = await res.text().catch(() => "");
    throw new Error(`SendGrid send failed (${res.status}): ${detail}`);
  }
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email not configured. Set SENDGRID_API_KEY, EMAIL_FROM, EMAIL_TO.");
    this.name = "EmailNotConfiguredError";
  }
}
