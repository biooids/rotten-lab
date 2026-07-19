// src/features/admin/admin.types.ts
import type { UserRole } from "../auth/auth.types.js";

export interface AdminUserDTO {
  id: string;
  username: string;
  role: UserRole;
  has_system_ai_access: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateRoleDTO {
  targetUserId: string;
  newRole: UserRole;
}

export interface SystemSettingsDTO {
  is_maintenance: boolean;
  maintenance_message: string;
  // ADDED: Explicit booleans for global AI access
  allow_global_gemini: boolean;
  allow_global_claude: boolean;
  updated_at: string;
  updated_by?: string | null;
}

// MODIFIED: Renamed to UpdateSystemSettingsDTO to be more accurate, and added AI toggles
export interface UpdateSystemSettingsDTO {
  is_maintenance: boolean;
  maintenance_message: string;
  allow_global_gemini: boolean;
  allow_global_claude: boolean;
}

export interface AuditLogDTO {
  id: string;
  admin_id: string;
  admin_username: string;
  action: string;
  details: string;
  created_at: string;
}

export interface RevokeSessionsDTO {
  targetUserId: string;
}

export interface SecurityBanDTO {
  key: string;
  type: "IP" | "USERNAME";
  target: string;
  remainingSeconds: number;
}
export interface UpdateAiAccessDTO {
  targetUserId: string;
  hasAccess: boolean;
}
