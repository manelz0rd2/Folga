export type SectionId = "overview" | "map" | "clean" | "large" | "apps" | "ai" | "monitor";
export type Risk = "safe" | "review" | "care";

export interface StorageOverview {
  total: number;
  used: number;
  free: number;
  reclaimable: number;
  device: string;
  scannedAt: string;
}

export interface CleanCategory {
  id: string;
  title: string;
  description: string;
  size: number;
  count: number;
  risk: Risk;
  selected: boolean;
}

export interface LargeFile {
  name: string;
  path: string;
  size: number;
  kind: string;
  age: string;
}

export interface ToolUsage {
  name: string;
  detail: string;
  size: number;
  running: boolean;
  color: string;
}
