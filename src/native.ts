import { invoke } from "@tauri-apps/api/core";

export interface NativeDisk {
  name: string;
  mountPath: string;
  totalBytes: number;
  availableBytes: number;
}

export interface NativePlatformInfo {
  os: string;
  computerLabel: string;
  trashLabel: string;
  defaultScanRoot: string;
}

export interface NativeCleanupLocation {
  id: string;
  title: string;
  path: string;
  risk: "safe" | "review" | "care";
  sizeBytes: number;
  fileCount: number;
}

export interface NativeFolder {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  fileCount: number;
}

export interface NativeLargeFile {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
}

export interface NativeScanReport {
  root: string;
  folders: NativeFolder[];
  largeFiles: NativeLargeFile[];
  treemapFiles: NativeLargeFile[];
  scannedBytes: number;
  scannedFiles: number;
}

export interface NativeSystemMetrics {
  cpuPercent: number;
  totalMemoryBytes: number;
  usedMemoryBytes: number;
  processes: Array<{ name: string; cpuPercent: number; memoryBytes: number }>;
}

export interface NativeAiTool {
  name: string;
  path: string;
  sizeBytes: number;
  fileCount: number;
  running: boolean;
}

export interface NativeInstalledApp {
  name: string;
  publisher: string;
  installLocation: string;
  sizeBytes: number;
  iconDataUrl: string;
}

export const hasNativeRuntime = () => "__TAURI_INTERNALS__" in window;
export const getPlatformInfo = () => invoke<NativePlatformInfo>("platform_info");
export const getDisks = () => invoke<NativeDisk[]>("disks");
export const getSystemMetrics = () => invoke<NativeSystemMetrics>("system_metrics");
export const scanCleanup = () => invoke<NativeCleanupLocation[]>("scan_cleanup_locations");
export const scanHome = (root: string) => invoke<NativeScanReport>("scan_home", { root, minimumBytes: 500 * 1024 * 1024 });
export const scanFolderChildren = (root: string) => invoke<NativeFolder[]>("scan_folder_children", { root });
export const cleanupSelected = (ids: string[]) => invoke<number>("cleanup_selected", { ids });
export const scanAiTools = () => invoke<NativeAiTool[]>("scan_ai_tools");
export const getInstalledApps = () => invoke<NativeInstalledApp[]>("installed_apps");
export const openFolder = (path: string) => invoke<void>("open_folder", { path });
