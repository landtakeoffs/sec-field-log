import { NextResponse } from "next/server";
import { dropboxConfigured, dropboxFolder } from "@/lib/dropbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: dropboxConfigured(),
    folder: dropboxFolder(),
  });
}
