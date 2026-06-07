//src/features/auth/auth.service.ts
import { pool } from "../../db/psql.js";

// ADDED: Fail-fast check for critical encryption key at the module level.
// This runs immediately when this service is imported anywhere in the app,
// guaranteeing it crashes before startup finishes if the key is missing.
if (!process.env["DB_ENCRYPTION_KEY"]) {
  process.stderr.write(
    "[FATAL ERROR]: DB_ENCRYPTION_KEY is missing from environment variables. Halting startup to prevent data corruption.\n",
  );
  process.exit(1);
}

export const authService = {
  async signup(username: string, hash: string) {
    const sql = `
      INSERT INTO users (username, password_hash) 
      VALUES ($1, $2) 
      RETURNING id, username, role, created_at;
    `;
    return await pool.query(sql, [username, hash]);
  },

  async findUserByUsername(username: string) {
    const sql = `SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE username = $1;`;
    return await pool.query(sql, [username]);
  },

  // MODIFIED: Updated to decrypt the API keys using pgp_sym_decrypt and bracket notation for process.env
  async findUserById(id: string) {
    const encryptionKey = process.env["DB_ENCRYPTION_KEY"] as string;

    const sql = `
      SELECT 
        id, 
        username, 
        role, 
        CASE 
          WHEN gemini_api_key IS NOT NULL AND gemini_api_key <> '' 
          THEN pgp_sym_decrypt(dearmor(gemini_api_key), $2) 
          ELSE NULL 
        END AS gemini_api_key,
        CASE 
          WHEN claude_api_key IS NOT NULL AND claude_api_key <> '' 
          THEN pgp_sym_decrypt(dearmor(claude_api_key), $2) 
          ELSE NULL 
        END AS claude_api_key,
        created_at, 
        updated_at 
      FROM users 
      WHERE id = $1;
    `;
    try {
      return await pool.query(sql, [id, encryptionKey]);
    } catch (error) {
      console.error("[AUTH_SERVICE FATAL ERROR - findUserById]: ", error);
      throw error;
    }
  },

  async updateUser(username: string, id: string) {
    const sql = `
      UPDATE users 
      SET username = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, username, role, updated_at;
    `;
    return await pool.query(sql, [username, id]);
  },

  // ADDED: New function to encrypt and update API keys using pgp_sym_encrypt and bracket notation
  async updateApiKeys(
    id: string,
    geminiApiKey: string | null,
    claudeApiKey: string | null,
  ) {
    const encryptionKey = process.env["DB_ENCRYPTION_KEY"] as string;

    const sql = `
      UPDATE users 
      SET 
        gemini_api_key = CASE 
          WHEN $2::text IS NOT NULL AND $2::text <> '' THEN armor(pgp_sym_encrypt($2::text, $4))
          WHEN $2::text = '' THEN NULL
          ELSE gemini_api_key 
        END,
        claude_api_key = CASE 
          WHEN $3::text IS NOT NULL AND $3::text <> '' THEN armor(pgp_sym_encrypt($3::text, $4))
          WHEN $3::text = '' THEN NULL
          ELSE claude_api_key 
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, username, role, updated_at;
    `;
    try {
      return await pool.query(sql, [
        id,
        geminiApiKey,
        claudeApiKey,
        encryptionKey,
      ]);
    } catch (error) {
      console.error("[AUTH_SERVICE FATAL ERROR - updateApiKeys]: ", error);
      throw error;
    }
  },

  async updatePassword(hash: string, id: string) {
    const sql = `
      UPDATE users 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2;
    `;
    return await pool.query(sql, [hash, id]);
  },

  async deleteUser(id: string) {
    const sql = `DELETE FROM users WHERE id = $1 RETURNING id;`;
    return await pool.query(sql, [id]);
  },

  async createRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    userAgent: string | null,
    ipAddress: string | null,
    parentTokenId: string | null = null,
  ) {
    const sql = `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address, parent_token_id) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING id, user_id, parent_token_id, is_revoked, expires_at;
    `;
    return await pool.query(sql, [
      userId,
      tokenHash,
      expiresAt,
      userAgent,
      ipAddress,
      parentTokenId,
    ]);
  },

  async findRefreshTokenByHash(tokenHash: string) {
    const sql = `
      SELECT id, user_id, token_hash, parent_token_id, is_revoked, expires_at, user_agent, ip_address, created_at 
      FROM refresh_tokens 
      WHERE token_hash = $1;
    `;
    return await pool.query(sql, [tokenHash]);
  },

  async revokeRefreshTokenById(id: string) {
    const sql = `
      UPDATE refresh_tokens 
      SET is_revoked = true 
      WHERE id = $1 
      RETURNING id;
    `;
    return await pool.query(sql, [id]);
  },

  async revokeRefreshTokenByHash(tokenHash: string) {
    const sql = `
      UPDATE refresh_tokens 
      SET is_revoked = true 
      WHERE token_hash = $1 
      RETURNING id;
    `;
    return await pool.query(sql, [tokenHash]);
  },

  async revokeEntireTokenFamily(userId: string) {
    const sql = `
      UPDATE refresh_tokens 
      SET is_revoked = true 
      WHERE user_id = $1 AND is_revoked = false
      RETURNING id;
    `;
    return await pool.query(sql, [userId]);
  },

  async deleteAllUserRefreshTokens(userId: string) {
    const sql = `
      DELETE FROM refresh_tokens 
      WHERE user_id = $1 
      RETURNING id;
    `;
    return await pool.query(sql, [userId]);
  },

  async deleteExpiredRefreshTokens() {
    const sql = `
      DELETE FROM refresh_tokens 
      WHERE expires_at < CURRENT_TIMESTAMP 
      RETURNING id;
    `;
    return await pool.query(sql);
  },
};
