import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sheetsConfigured, sheetLink, hoursTab, inspectionsTab } from "../lib/sheets";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    postgres: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    officePinConfigured: Boolean(process.env.OFFICE_PIN?.trim()),
    sheet: {
      configured: sheetsConfigured(),
      link: sheetLink(),
      hoursTab: hoursTab(),
      inspectionsTab: inspectionsTab(),
    },
  });
}
