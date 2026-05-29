export type ClaudeModelId =
  | "claude-sonnet-4-6"
  | "claude-opus-4-7"
  | "claude-haiku-4-5";

export interface ScanRequestDTO {
  targetUrl: string;
  secretAccessKey: string;
  model?: ClaudeModelId;
}

export interface DatabaseScanReport {
  id: string;
  target_url: string;
  scan_type: "url" | "repo";
  ai_provider: string;
  ai_model: string;
  status: "pending" | "processing" | "completed" | "failed";
  engine_warnings: string[];
  scanned_by: string | null;
  total_chunks: number;
  completed_chunks: number;
  created_at: Date;
  updated_at: Date;
}

export interface DatabaseScanFinding {
  id: string;
  report_id: string;
  file_path: string | null;
  vulnerability_name: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  code_snippet: string | null;
  ai_explanation: string;
  how_to_trigger: string;
  ai_fix_suggestion: string;
  created_at: Date;
}

export interface TokenMetrics {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// The exact structure we force Claude to return in a single bulk API call
export interface BulkClaudeFindingResponse {
  reference_id: number;
  explanation: string;
  how_to_trigger: string;
  how_to_fix: string;
}

export interface EnrichedScanReportResponse {
  report: DatabaseScanReport;
  findings: DatabaseScanFinding[];
  warnings: string[];
}

// --- NEW TYPES FOR PAGINATION ---
export interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  limit: number;
}
