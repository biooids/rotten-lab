//src/lib/features/ai/gemini/geminiTypes.ts

export type SeverityLevel = "Low" | "Medium" | "High" | "Critical";

export type ScanStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

// --- START OF CHANGES ---
export const GEMINI_MODELS = {
  FLASH_LATEST: "gemini-3.6-flash",
  FLASH_LITE: "gemini-3.5-flash-lite",
  PRO_STABLE: "gemini-2.5-pro",
} as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];
// --- END OF CHANGES ---

export interface GeminiModelInfo {
  id: GeminiModelId;
  label: string;
  tagline: string;
  strengths: string;
  tradeoff: string;
}

export const GEMINI_MODEL_CATALOG: readonly GeminiModelInfo[] = [
  {
    id: GEMINI_MODELS.FLASH_LATEST,
    label: "Flash 3.6",
    tagline: "Free-tier default",
    strengths: "Fast & cheap. Solid for most scans on the free tier.",
    tradeoff: "Less depth on complex multi-step reasoning.",
  },
  {
    id: GEMINI_MODELS.PRO_STABLE,
    label: "Pro 2.5",
    tagline: "Deepest analysis (paid)",
    strengths:
      "Best Gemini for tricky vulns, multi-file repos, subtle logic flaws.",
    tradeoff: "Paid tier. Slower and pricier than Flash.",
  },
  {
    id: GEMINI_MODELS.FLASH_LITE,
    label: "Flash-Lite 3.5",
    tagline: "Cheapest & fastest",
    strengths: "Snap analyses on small repos and quick web sweeps.",
    tradeoff: "Most aggressive trade-off on depth.",
  },
] as const;

export const DEFAULT_GEMINI_MODEL: GeminiModelId = GEMINI_MODELS.FLASH_LATEST;

export interface ScanRequestDTO {
  targetUrl: string;
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
  status_message?: string;
  engine_warnings: string[];
  scanned_by: string | null;
  total_chunks: number;
  completed_chunks: number;
  key_type?: "global" | "personal"; // <-- ADD THIS
  created_at: string;
  updated_at: string;
}

export interface InitScanResponse {
  message: string;
  reportId: string;
}

// --- META AND PARAM TYPES FOR PAGINATION ---
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
    meta: PaginationMeta | null;
  };
}

export interface ScanHistoryResponse {
  message: string;
  data: ScanReport[];
  meta?: PaginationMeta;
}

// --- NEW CHAT SYSTEM TYPES ---
export type ChatRole = "user" | "ai";

export interface ReportChatSession {
  id: string;
  report_id: string;
  user_id: string;
  role: ChatRole;
  message: string;
  created_at: string;
  key_type?: "global" | "personal"; // <-- ADD THIS
}

export interface ChatMessageRequestDTO {
  message: string;
  findingId?: string;
  selectedModel?: string;
}

export interface ChatHistoryResponse {
  history: ReportChatSession[];
}
