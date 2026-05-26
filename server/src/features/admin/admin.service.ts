//src/features/admin/admin.service.ts
import { redisClient } from "../../db/redis.js";
import { pool } from "../../db/psql.js";
import type { UserRole } from "../auth/auth.types.js";
import type { SecurityBanDTO } from "./admin.types.js";

export const adminService = {
  async getUserById(userId: string) {
    const sql = `
      SELECT id, username, role 
      FROM users 
      WHERE id = $1;
    `;
    return await pool.query(sql, [userId]);
  },

  async getAllUsers() {
    const sql = `
      SELECT id, username, role, created_at, updated_at 
      FROM users 
      ORDER BY created_at DESC;
    `;
    return await pool.query(sql);
  },

  async updateUserRole(userId: string, newRole: UserRole) {
    const sql = `
      UPDATE users 
      SET role = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 
      RETURNING id, username, role;
    `;
    return await pool.query(sql, [newRole, userId]);
  },

  async deleteUser(userId: string) {
    return await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  },

  async getAuditLogs(
    searchQuery?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const offset = (page - 1) * limit;

    if (searchQuery) {
      const sql = `
        SELECT id, admin_id, admin_username, action, details, created_at,
               count(*) OVER() AS full_count
        FROM audit_logs 
        WHERE search_vector @@ plainto_tsquery('english', $1)
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3;
      `;
      return await pool.query(sql, [searchQuery, limit, offset]);
    }

    const sql = `
      SELECT id, admin_id, admin_username, action, details, created_at,
             count(*) OVER() AS full_count
      FROM audit_logs 
      ORDER BY created_at DESC 
      LIMIT $1 OFFSET $2;
    `;
    return await pool.query(sql, [limit, offset]);
  },

  async getSystemSettings() {
    const sql = `SELECT is_maintenance, maintenance_message FROM system_settings WHERE id = 1;`;
    return await pool.query(sql);
  },

  async updateSystemSettings(
    isMaintenance: boolean,
    message: string,
    adminId: string,
  ) {
    const settingsSql = `
      UPDATE system_settings 
      SET is_maintenance = $1, maintenance_message = $2, updated_by = $3
      WHERE id = 1
      RETURNING is_maintenance, maintenance_message, updated_at;
    `;
    const result = await pool.query(settingsSql, [
      isMaintenance,
      message,
      adminId,
    ]);

    const actionName = isMaintenance ? "SYSTEM_LOCKED" : "SYSTEM_UNLOCKED";
    const logSql = `
      INSERT INTO audit_logs (admin_id, admin_username, action, details)
      SELECT $1, username, $2, $3 
      FROM users 
      WHERE id = $1;
    `;
    await pool.query(logSql, [adminId, actionName, message]);

    await redisClient.set(
      "maintenance:status",
      isMaintenance ? "true" : "false",
    );
    await redisClient.set("maintenance:message", message);

    return result;
  },

  async revokeAllUserSessions(targetUserId: string, adminId: string) {
    const deleteSql = `DELETE FROM refresh_tokens WHERE user_id = $1 RETURNING id;`;
    const result = await pool.query(deleteSql, [targetUserId]);

    const logSql = `
      INSERT INTO audit_logs (admin_id, admin_username, action, details)
      SELECT $1, username, 'SESSIONS_REVOKED', 'Terminated ' || $3 || ' active sessions for User ID: ' || $2 
      FROM users 
      WHERE id = $1;
    `;
    await pool.query(logSql, [adminId, targetUserId, result.rowCount]);

    return result.rowCount;
  },

  async getActiveSecurityBans(): Promise<SecurityBanDTO[]> {
    const ipKeys = await redisClient.keys("ratelimit:login:ban:ip:*");
    const userKeys = await redisClient.keys("ratelimit:login:ban:user:*");

    const allKeys = [...ipKeys, ...userKeys];
    const bans: SecurityBanDTO[] = [];

    for (const key of allKeys) {
      const ttl = await redisClient.ttl(key);
      if (ttl > 0) {
        const isIp = key.includes(":ip:");
        bans.push({
          key,
          type: isIp ? "IP" : "USERNAME",
          target: key.split(":").pop() || "unknown",
          remainingSeconds: ttl,
        });
      }
    }

    return bans.sort((a, b) => b.remainingSeconds - a.remainingSeconds);
  },

  async liftSecurityBan(redisKey: string, adminId: string) {
    if (!redisKey.startsWith("ratelimit:login:ban:")) {
      throw new Error("Invalid key protocol. Only ban keys can be lifted.");
    }

    const deletedCount = await redisClient.del(redisKey);

    if (deletedCount > 0) {
      const target = redisKey.split(":").pop() || "unknown";
      const logSql = `
        INSERT INTO audit_logs (admin_id, admin_username, action, details)
        SELECT $1, username, 'BAN_LIFTED', 'Manually lifted security ban for target: ' || $2 
        FROM users 
        WHERE id = $1;
      `;
      await pool.query(logSql, [adminId, target]);
    }

    return deletedCount > 0;
  },
};
