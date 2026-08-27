import type { DateRange } from "./dates";
import { timesheetFileName } from "./timesheet";

const DEFAULT_FOLDER = "/SEC Field Log/Weekly Hours";

export function dropboxFolder(): string {
  const folder = (process.env.DROPBOX_FOLDER ?? DEFAULT_FOLDER).trim() || DEFAULT_FOLDER;
  return folder.endsWith("/") ? folder.slice(0, -1) : folder;
}

export function dropboxConfigured(): boolean {
  return Boolean(process.env.DROPBOX_ACCESS_TOKEN?.trim());
}

export interface DropboxUploadResult {
  path: string;
  name: string;
}

export async function uploadTimesheetToDropbox(
  csv: string,
  range: DateRange,
): Promise<DropboxUploadResult> {
  const token = process.env.DROPBOX_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new DropboxNotConfiguredError();
  }

  const name = timesheetFileName(range);
  const path = `${dropboxFolder()}/${name}`;
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode: "overwrite",
        autorename: false,
        mute: true,
      }),
    },
    body: Buffer.from(csv, "utf8"),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new DropboxUploadError(
      `Dropbox upload failed (${response.status})`,
      response.status,
      detail,
    );
  }

  const payload = (await response.json()) as { path_display?: string; name?: string };
  return {
    path: payload.path_display ?? path,
    name: payload.name ?? name,
  };
}

export class DropboxNotConfiguredError extends Error {
  constructor() {
    super("Dropbox is not configured. Set DROPBOX_ACCESS_TOKEN on the server.");
    this.name = "DropboxNotConfiguredError";
  }
}

export class DropboxUploadError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail: string) {
    super(message);
    this.name = "DropboxUploadError";
    this.status = status;
    this.detail = detail;
  }
}
