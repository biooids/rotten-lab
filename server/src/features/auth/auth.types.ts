//src/features/auth/auth.types.ts

export type UserRole = "user" | "admin" | "super_admin";

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

// Database representation of the new refresh_tokens table
export interface RefreshTokenSession {
  id: string;
  user_id: string;
  token_hash: string;
  parent_token_id: string | null;
  is_revoked: boolean;
  expires_at: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
}

// This will now exclusively represent the short-lived access token
export interface JWTPayload {
  id: string;
  username: string;
  role: UserRole;
  token_use: "access"; // Strict identifier
  iat?: number;
  exp?: number;
}

export interface SignupDTO {
  username?: string;
  password?: string;
  confirmPassword?: string;
}

export interface LoginDTO {
  username?: string;
  password?: string;
}

export interface ChangePasswordDTO {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export interface UpdateAccountDTO {
  username?: string;
}
