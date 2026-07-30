//src/lib/features/ai/claude/claudeTypes.ts
export type SeverityLevel = "Low" | "Medium" | "High" | "Critical";

export type ScanStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export const CLAUDE_MODELS = {
  SONNET_LATEST: "claude-sonnet-4-6",
  OPUS_LATEST: "claude-opus-4-7",
  HAIKU_LATEST: "claude-haiku-4-5",
} as const;

export type ClaudeModelId = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

export interface ClaudeModelInfo {
  id: ClaudeModelId;
  label: string;
  tagline: string;
  strengths: string;
  tradeoff: string;
}

export const CLAUDE_MODEL_CATALOG: readonly ClaudeModelInfo[] = [
  {
    id: CLAUDE_MODELS.SONNET_LATEST,
    label: "Sonnet 4.6",
    tagline: "Balanced default",
    strengths:
      "Strong reasoning on real-world code. Solid pick for most scans.",
    tradeoff: "Medium cost, medium speed.",
  },
  {
    id: CLAUDE_MODELS.OPUS_LATEST,
    label: "Opus 4.7",
    tagline: "Deepest analysis",
    strengths:
      "Best at multi-step reasoning, subtle vulns, complex architectures.",
    tradeoff: "Slower and most expensive. Use on hard targets.",
  },
  {
    id: CLAUDE_MODELS.HAIKU_LATEST,
    label: "Haiku 4.5",
    tagline: "Fastest & cheapest",
    strengths: "Snappy turnaround on small repos and quick web sweeps.",
    tradeoff: "Less depth on tricky multi-file logic.",
  },
] as const;

export const DEFAULT_CLAUDE_MODEL: ClaudeModelId = CLAUDE_MODELS.SONNET_LATEST;
export interface ScanRequestDTO {
  targetUrl: string;
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
  status_message?: string;
  engine_warnings: string[];
  scanned_by: string | null;
  total_chunks: number;
  completed_chunks: number;
  created_at: string;
  updated_at: string;
  key_type?: "global" | "personal";
}

export interface InitScanResponse {
  message: string;
  reportId: string;
}

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

export type ChatRole = "user" | "ai";

export interface ReportChatSession {
  id: string;
  report_id: string;
  user_id: string;
  role: ChatRole;
  message: string;
  created_at: string;
  key_type?: "global" | "personal";
}

export interface ChatMessageRequestDTO {
  message: string;
  findingId?: string;
  selectedModel?: string;
}

export interface ChatHistoryResponse {
  history: ReportChatSession[];
}
