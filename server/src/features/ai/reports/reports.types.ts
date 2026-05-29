//src/features/ai/reports/reports.types.ts

export interface DatabaseReportContext {
  id: string;
  target_url: string;
  scan_type: "url" | "repo";
  ai_provider: string;
  ai_model: string;
  status: string;
  scanned_by: string | null;
  created_at: Date;
}

export interface DatabaseFindingContext {
  vulnerability_name: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  file_path: string | null;
  code_snippet: string | null;
  ai_explanation: string;
  how_to_trigger: string;
  ai_fix_suggestion: string;
}

// --- CHAT SYSTEM TYPES ---
export type ChatRole = "user" | "ai";

export interface ReportChatSession {
  id: string;
  report_id: string;
  finding_id: string; // NEW: Strict per-card relation mapping
  user_id: string;
  role: ChatRole;
  message: string;
  created_at: Date;
}

export interface ChatMessageRequestDTO {
  message: string;
  findingId: string; // CHANGED: Now required, no longer optional
  selectedModel?: string;
}

export interface ChatHistoryResponse {
  history: ReportChatSession[];
}
