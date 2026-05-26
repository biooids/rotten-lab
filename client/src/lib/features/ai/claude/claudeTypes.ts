//src/lib/features/ai/claude/claudeTypes.ts
export type SeverityLevel = "Low" | "Medium" | "High" | "Critical";
export type ScanStatus = "pending" | "processing" | "completed" | "failed";

export type ClaudeModelId =
  | "claude-sonnet-4-6"
  | "claude-opus-4-7"
  | "claude-haiku-4-5";

export interface ClaudeModelInfo {
  id: ClaudeModelId;
  label: string;
  tagline: string;
  strengths: string;
  tradeoff: string;
}

export const CLAUDE_MODEL_CATALOG: readonly ClaudeModelInfo[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    tagline: "Balanced default",
    strengths:
      "Strong reasoning on real-world code. Solid pick for most scans.",
    tradeoff: "Medium cost, medium speed.",
  },
  {
    id: "claude-opus-4-7",
    label: "Opus 4.7",
    tagline: "Deepest analysis",
    strengths:
      "Best at multi-step reasoning, subtle vulns, complex architectures.",
    tradeoff: "Slower and most expensive. Use on hard targets.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    tagline: "Fastest & cheapest",
    strengths:
      "Snappy turnaround on small repos and quick web sweeps.",
    tradeoff: "Less depth on tricky multi-file logic.",
  },
] as const;

export const DEFAULT_CLAUDE_MODEL: ClaudeModelId = "claude-sonnet-4-6";

export interface ScanRequestDTO {
  targetUrl: string;
  secretAccessKey: string;
  model?: ClaudeModelId;
}

export interface ClaudeFinding {
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

// --- RESPONSES WITH META ---
export interface ScanResponse {
  message: string;
  data: {
    report: ScanReport;
    findings: ClaudeFinding[];
    meta: PaginationMeta | null;
  };
}

export interface ScanHistoryResponse {
  message: string;
  data: ScanReport[];
  meta?: PaginationMeta;
}
