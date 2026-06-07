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
              // MODIFIED: Expanded error logging to dump the full stack and raw object
              .catch((err: any) => {
                process.stderr.write(
                  `[ZOMBIE_CRASH_GEMINI_URL] Failed to resume: ${err?.message || err}\nStack: ${err?.stack || "no stack"}\n`,
                );
                process.stderr.write(
                  `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
                );
              });
          } else {
            geminiService
              .runBackgroundRepoScan(
                report.id,
                report.target_url,
                report.scanned_by,
                report.ai_model,
              )
              // MODIFIED: Expanded error logging to dump the full stack and raw object
              .catch((err: any) => {
                process.stderr.write(
                  `[ZOMBIE_CRASH_GEMINI_REPO] Failed to resume: ${err?.message || err}\nStack: ${err?.stack || "no stack"}\n`,
                );
                process.stderr.write(
                  `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
                );
              });
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
              // MODIFIED: Expanded error logging to dump the full stack and raw object
              .catch((err: any) => {
                process.stderr.write(
                  `[ZOMBIE_CRASH_CLAUDE_URL] Failed to resume: ${err?.message || err}\nStack: ${err?.stack || "no stack"}\n`,
                );
                process.stderr.write(
                  `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
                );
              });
          } else {
            claudeService
              .runBackgroundRepoScan(
                report.id,
                report.target_url,
                report.scanned_by,
                report.ai_model,
              )
              // MODIFIED: Expanded error logging to dump the full stack and raw object
              .catch((err: any) => {
                process.stderr.write(
                  `[ZOMBIE_CRASH_CLAUDE_REPO] Failed to resume: ${err?.message || err}\nStack: ${err?.stack || "no stack"}\n`,
                );
                process.stderr.write(
                  `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
                );
              });
          }
        }
      }
    } catch (err: any) {
      // MODIFIED: Expanded database query error logging to ensure no errors are hidden
      process.stderr.write(
        `[ZOMBIE_SWEEPER_ERROR] Failed to query database: ${err?.message || err}\nStack: ${err?.stack || "no stack"}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
    }
  },
};
