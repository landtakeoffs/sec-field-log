export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Entry {
  id: number;
  title: string;
  location: string;
  severity: Severity;
  notes: string;
  created_at: string;
}

export interface NewEntry {
  title: string;
  location?: string;
  severity?: Severity;
  notes?: string;
}
