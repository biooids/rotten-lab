//src/lib/features/ai/gemini/geminiTypes.ts
export type SeverityLevel = "Low" | "Medium" | "High" | "Critical";
export type ScanStatus = "pending" | "processing" | "completed" | "failed";

export type GeminiModelId =
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite";

export interface GeminiModelInfo {
  id: GeminiModelId;
  label: string;
  tagline: string;
  strengths: string;
  tradeoff: string;
}

export const GEMINI_MODEL_CATALOG: readonly GeminiModelInfo[] = [
  {
    id: "gemini-2.5-flash",
    label: "Flash 2.5",
    tagline: "Free-tier default",
    strengths:
      "Fast & cheap. Solid for most scans on the free tier.",
    tradeoff: "Less depth on complex multi-step reasoning.",
  },
  {
    id: "gemini-2.5-pro",
    label: "Pro 2.5",
    tagline: "Deepest analysis (paid)",
    strengths:
      "Best Gemini for tricky vulns, multi-file repos, subtle logic flaws.",
    tradeoff: "Paid tier. Slower and pricier than Flash.",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Flash-Lite 2.5",
    tagline: "Cheapest & fastest",
    strengths:
      "Snap analyses on small repos and quick web sweeps.",
    tradeoff: "Most aggressive trade-off on depth.",
  },
] as const;

export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-2.5-flash";

export interface ScanRequestDTO {
  targetUrl: string;
  secretAccessKey: string;
  model?: GeminiModelId;
}

export interface GeminiFinding {
  id: string;
  report_id: string;
  file_path: string | null;
  vulnerability_name: string;
  level: SeverityLevel;
  code_snippet: string | null;
  explanation: string;
  how_to_trigger: string;
  how_to_fix: string;
  created_at: string;
}

export interface ScanReport {
  id: string;
  target_url: string;
  scan_type: "url" | "repo";
  ai_provider: string;
  ai_model: string;
  status: ScanStatus;
  engine_warnings: string[];
  scanned_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitScanResponse {
  message: string;
  reportId: string;
}

// --- NEW META AND PARAM TYPES FOR PAGINATION ---
export interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  limit: number;
}

export interface HistoryQueryParams {
  page?: number;
  limit?: number;
  type?: string;
  timeframe?: string;
}

export interface ReportQueryParams {
  reportId: string;
  page?: number;
  limit?: number;
}

// --- UPDATED RESPONSES WITH META ---
export interface ScanResponse {
  message: string;
  data: {
    report: ScanReport;
    findings: GeminiFinding[];
    meta: PaginationMeta | null; // Added meta
  };
}

export interface ScanHistoryResponse {
  message: string;
  data: ScanReport[];
  meta?: PaginationMeta; // Added meta
}
