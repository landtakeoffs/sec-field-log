import { NextResponse } from "next/server";
import { sheetLink, sheetTab, sheetsConfigured } from "@/lib/sheets";
import { emailConfigured } from "@/lib/email";
import { storeName } from "@/lib/entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public status the mobile UI reads to hide/show controls. No secrets. */
export async function GET() {
  return NextResponse.json({
    store: storeName(),
    sheet: {
      configured: sheetsConfigured(),
      link: sheetLink(),
      tab: sheetTab(),
    },
    email: {
      configured: emailConfigured(),
    },
  });
}
