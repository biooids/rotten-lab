//src/workers/tokenCleanup.ts
import { authService } from "../features/auth/auth.service.js";
import { redisClient } from "../db/redis.js";

// Track consecutive failures so we can shout louder if the worker silently dies.
// If N cycles in a row fail, the refresh_tokens table will grow unboundedly — that's
// worth a more prominent log line than a regular WARNING.
let consecutiveFailures = 0;

export const startTokenCleanupWorker = () => {
  console.log("🧹  Starting Background Token Cleanup Worker (Redis-Locked)...");

  const CLEANUP_INTERVAL = 1000 * 60 * 60;

  setInterval(async () => {
    // Step 1: acquire the Redis lock. If Redis is down, we want to know that
    // specifically — it's a different failure mode (infrastructure outage) than
    // a DB error during the actual cleanup.
    let lockAcquired: string | null | unknown = null;
    try {
      lockAcquired = await redisClient.set(
        "cron:token-cleanup-lock",
        "locked",
        {
          nx: true,
          ex: 300,
        },
      );
    } catch (redisErr) {
      consecutiveFailures++;
      process.stderr.write(
        `[CRON_REDIS_DOWN] Token cleanup: Redis lock acquisition failed (consecutive failures=${consecutiveFailures}). Cycle skipped. err=${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
      );
      if (consecutiveFailures >= 5) {
        process.stderr.write(
          `[CRON_CRITICAL] Token cleanup has failed ${consecutiveFailures} consecutive cycles. refresh_tokens table is growing unboundedly. Investigate Redis health immediately.\n`,
        );
      }
      return;
    }

    if (!lockAcquired) {
      // Another instance holds the lock. Not a failure — reset the counter so a
      // healthy multi-instance deployment doesn't trip the critical alert above.
      consecutiveFailures = 0;
      return;
    }

    // Step 2: run the actual DB cleanup. A failure here is a DB-side issue (pool
    // exhausted, connection refused, query timeout) and is logged separately so
    // grepping logs for [CRON_DB_FAIL] reveals only DB problems.
    try {
      await authService.deleteExpiredRefreshTokens();
      consecutiveFailures = 0;
    } catch (dbErr) {
      consecutiveFailures++;
      process.stderr.write(
        `[CRON_DB_FAIL] Token cleanup: DB query failed (consecutive failures=${consecutiveFailures}). code=${(dbErr as any)?.code || "n/a"} err=${(dbErr as Error).message}\nStack: ${(dbErr as Error).stack}\n`,
      );
      if (consecutiveFailures >= 5) {
        process.stderr.write(
          `[CRON_CRITICAL] Token cleanup has failed ${consecutiveFailures} consecutive cycles on the DB side. refresh_tokens table is growing unboundedly. Investigate PostgreSQL health immediately.\n`,
        );
      }
    }
  }, CLEANUP_INTERVAL);
};
