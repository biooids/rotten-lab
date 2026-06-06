//src/features/ai/core-scanners/zombieRecovery.service.ts
import { pool } from "../../../db/psql.js";
import { geminiService } from "../gemini/gemini.service.js";
import { claudeService } from "../claude/claude.service.js";

export const zombieRecoveryService = {
  async resumeZombies(): Promise<void> {
    process.stdout.write(
      "[ZOMBIE_SWEEPER] Checking for interrupted AI scan jobs...\n",
    );

    try {
      const res = await pool.query(`
        SELECT id, target_url, scan_type, scanned_by, ai_provider, ai_model 
        FROM scan_reports 
        WHERE status = 'processing'
      `);

      if (res.rows.length === 0) {
        process.stdout.write(
          "[ZOMBIE_SWEEPER] No stuck jobs found. Clean slate.\n",
        );
        return;
      }

      process.stdout.write(
        `[ZOMBIE_SWEEPER] Found ${res.rows.length} stuck jobs. Resuming native promises...\n`,
      );

      for (const report of res.rows) {
        if (report.ai_provider === "gemini") {
          if (report.scan_type === "url") {
            geminiService
              .runBackgroundUrlScan(
                report.id,
                report.target_url,
                report.scanned_by,
                report.ai_model,
              )
              .catch((err) =>
                process.stderr.write(`[ZOMBIE_CRASH] ${err.message}\n`),
              );
          } else {
            geminiService
              .runBackgroundRepoScan(
                report.id,
                report.target_url,
                report.scanned_by,
                report.ai_model,
              )
              .catch((err) =>
                process.stderr.write(`[ZOMBIE_CRASH] ${err.message}\n`),
              );
          }
        } else if (report.ai_provider === "claude") {
          if (report.scan_type === "url") {
            claudeService
              .runBackgroundUrlScan(
                report.id,
                report.target_url,
                report.scanned_by,
                report.ai_model,
              )
              .catch((err) =>
                process.stderr.write(`[ZOMBIE_CRASH] ${err.message}\n`),
              );
          } else {
            claudeService
              .runBackgroundRepoScan(
                report.id,
                report.target_url,
                report.scanned_by,
                report.ai_model,
              )
              .catch((err) =>
                process.stderr.write(`[ZOMBIE_CRASH] ${err.message}\n`),
              );
          }
        }
      }
    } catch (err) {
      process.stderr.write(
        `[ZOMBIE_SWEEPER_ERROR] Failed to query database: ${(err as Error).message}\n`,
      );
    }
  },
};
