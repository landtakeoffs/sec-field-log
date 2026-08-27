import { NextResponse } from "next/server";
import { storeName } from "@/lib/entries";
import { dropboxConfigured, dropboxFolder } from "@/lib/dropbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quick check that a deployment is wired up: which database, and Dropbox state. */
export async function GET() {
  const storage = storeName();
  return NextResponse.json({
    storage,
    persistent: storage === "postgres",
    dropbox: { configured: dropboxConfigured(), folder: dropboxFolder() },
  });
}
