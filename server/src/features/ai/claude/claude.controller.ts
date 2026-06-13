//src/features/ai/claude/claude.controller.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "node:stream/consumers";
import jwt from "jsonwebtoken";
import { claudeService } from "./claude.service.js";
import type { ClaudeModelId, ScanRequestDTO } from "./claude.types.js";
import type { JWTPayload } from "../../auth/auth.types.js";
import { pool } from "../../../db/psql.js"; // ADDED: Required for user role/key lookup

const ACCESS_TOKEN_SECRET = process.env["ACCESS_TOKEN_SECRET"];

if (!ACCESS_TOKEN_SECRET) {
  process.stderr.write(
    "FATAL RUNTIME CONFIG ERROR: Environment keys unassigned for Claude.\n",
  );
  process.exit(1);
}

export const claudeController = {
  // --- 1. ASYNC URL SCANNER ENTRY POINT ---
  async scanUrl(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json");
    process.stdout.write(
      `\n[HTTP] POST /api/v1/ai/claude/scan-url initialized\n`,
    );

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      process.stderr.write(`[HTTP_REJECT] Missing Bearer token.\n`);
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized: Missing token." }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid JWT: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 401;
      res.end(
        JSON.stringify({ error: "Unauthorized: Invalid or expired token." }),
      );
      return;
    }

    let body: ScanRequestDTO;
    try {
      body = (await json(req)) as ScanRequestDTO;
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid JSON Body: ${err.message}\nStack: ${err.stack}\n`,
      );
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON body payload." }));
      return;
    }

    if (!body.targetUrl || body.targetUrl.trim() === "") {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Target URL is strictly required." }));
      return;
    }

    // --- URL Auto-Format & Native Validation ---
    if (!/^https?:\/\//i.test(body.targetUrl)) {
      body.targetUrl = `https://${body.targetUrl.trim()}`;
    }
    try {
      const parsedUrl = new URL(body.targetUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error: "Invalid protocol. Only HTTP and HTTPS are supported.",
          }),
        );
        return;
      }
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Malformed URL: ${err.message}\nStack: ${err.stack}\n`,
      );
      res.statusCode = 400;
      res.end(
        JSON.stringify({ error: "Malformed URL provided. Cannot scan." }),
      );
      return;
    }
    // --- END ADDED ---

    // --- ADDED: BYOK & ROLE AUTHORIZATION CHECK ---
    // If the user is an admin, let them through (they use the global .env key or their BYOK).
    // If they are a standard user, check both their personal key and the global system permission.
    if (decoded.role === "user") {
      try {
        // MODIFIED: Now fetching BOTH the personal key and the global system setting simultaneously
        const keyCheckSql = `
          SELECT 
            u.claude_api_key,
            (SELECT allow_global_claude FROM system_settings WHERE id = 1) AS allow_global_claude
          FROM users u 
          WHERE u.id = $1
        `;
        const keyRes = await pool.query(keyCheckSql, [decoded.id]);

        if (keyRes.rows.length === 0) {
          process.stderr.write(
            `[HTTP_SHIELD] Rejected: User ID ${decoded.id} not found in database.\n`,
          );
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "User record not found." }));
          return;
        }

        const userData = keyRes.rows[0];
        const hasPersonalKey =
          userData.claude_api_key && userData.claude_api_key.trim() !== "";
        const hasGlobalAccess = userData.allow_global_claude === true;

        // MODIFIED: Reject only if they lack a personal key AND global access is turned off
        if (!hasPersonalKey && !hasGlobalAccess) {
          process.stderr.write(
            `[HTTP_SHIELD] Rejected standard user ${decoded.id}: No BYOK Claude key configured and global access is disabled.\n`,
          );
          res.statusCode = 403;
          res.end(
            JSON.stringify({
              error:
                "Access Denied: Global access is disabled. You must configure a valid Claude API key in your Account Settings to perform scans.",
            }),
          );
          return;
        }
      } catch (dbErr: any) {
        process.stderr.write(
          `[HTTP_CRASH] Failed to check user API key status: ${dbErr.message}\nStack: ${dbErr.stack}\n`,
        );
        process.stderr.write(
          `[RAW_ERROR_DUMP] ${JSON.stringify(dbErr, Object.getOwnPropertyNames(dbErr), 2)}\n`,
        );
        res.statusCode = 500;
        res.end(
          JSON.stringify({ error: "Database error during key validation." }),
        );
        return;
      }
    }
    // --- END BYOK AUTHORIZATION CHECK ---

    let resolvedModel: ClaudeModelId = "claude-sonnet-4-6";
    if (
      body.model === "claude-sonnet-4-6" ||
      body.model === "claude-opus-4-7" ||
      body.model === "claude-haiku-4-5"
    ) {
      resolvedModel = body.model;
    }

    try {
      // Create Database Record immediately
      const report = await claudeService.initializeReport(
        body.targetUrl,
        "url",
        decoded.id,
        resolvedModel,
      );

      // Return 202 Accepted immediately to prevent 504 Timeout on Vercel/Client
      res.statusCode = 202;
      res.end(
        JSON.stringify({
          message: "URL Scan initialized. Processing in background.",
          reportId: report.id,
        }),
      );

      // Fire and Forget Background Worker
      claudeService
        .runBackgroundUrlScan(
          report.id,
          body.targetUrl,
          decoded.id,
          resolvedModel,
        )
        .catch((workerErr: any) => {
          process.stderr.write(
            `[FATAL_WORKER_ESCAPE] URL Worker failed to contain error: ${workerErr.message}\nStack: ${workerErr.stack}\n`,
          );
          process.stderr.write(
            `[RAW_ERROR_DUMP] ${JSON.stringify(workerErr, Object.getOwnPropertyNames(workerErr), 2)}\n`,
          );
        });
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_CRASH] Failed to initialize DB report: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: "Failed to initialize scan engine database row.",
        }),
      );
    }
  },

  // --- 2. ASYNC REPO SCANNER ENTRY POINT ---
  async scanRepo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json");
    process.stdout.write(
      `\n[HTTP] POST /api/v1/ai/claude/scan-repo initialized\n`,
    );

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      process.stderr.write(`[HTTP_REJECT] Missing Bearer token.\n`);
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized: Missing token." }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid JWT: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 401;
      res.end(
        JSON.stringify({ error: "Unauthorized: Invalid or expired token." }),
      );
      return;
    }

    let body: ScanRequestDTO;
    try {
      body = (await json(req)) as ScanRequestDTO;
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid JSON Body: ${err.message}\nStack: ${err.stack}\n`,
      );
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON body payload." }));
      return;
    }

    if (!body.targetUrl || body.targetUrl.trim() === "") {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error: "Target Git Repository URL is strictly required.",
        }),
      );
      return;
    }

    // --- URL Auto-Format, GitHub Verification & Native Validation ---
    if (!/^https?:\/\//i.test(body.targetUrl)) {
      body.targetUrl = `https://${body.targetUrl.trim()}`;
    }

    if (!body.targetUrl.toLowerCase().includes("github.com/")) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({ error: "Must be a valid GitHub repository URL." }),
      );
      return;
    }

    try {
      const parsedUrl = new URL(body.targetUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error: "Invalid protocol. Only HTTP and HTTPS are supported.",
          }),
        );
        return;
      }
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Malformed URL: ${err.message}\nStack: ${err.stack}\n`,
      );
      res.statusCode = 400;
      res.end(
        JSON.stringify({ error: "Malformed URL provided. Cannot scan." }),
      );
      return;
    }
    // --- END ADDED ---

    // --- ADDED: BYOK & ROLE AUTHORIZATION CHECK ---
    // Same check as URL scanner to ensure standard users are paying their own compute cost unless globally granted
    if (decoded.role === "user") {
      try {
        // MODIFIED: Now fetching BOTH the personal key and the global system setting simultaneously
        const keyCheckSql = `
          SELECT 
            u.claude_api_key,
            (SELECT allow_global_claude FROM system_settings WHERE id = 1) AS allow_global_claude
          FROM users u 
          WHERE u.id = $1
        `;
        const keyRes = await pool.query(keyCheckSql, [decoded.id]);

        if (keyRes.rows.length === 0) {
          process.stderr.write(
            `[HTTP_SHIELD] Rejected: User ID ${decoded.id} not found in database.\n`,
          );
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "User record not found." }));
          return;
        }

        const userData = keyRes.rows[0];
        const hasPersonalKey =
          userData.claude_api_key && userData.claude_api_key.trim() !== "";
        const hasGlobalAccess = userData.allow_global_claude === true;

        // MODIFIED: Reject only if they lack a personal key AND global access is turned off
        if (!hasPersonalKey && !hasGlobalAccess) {
          process.stderr.write(
            `[HTTP_SHIELD] Rejected standard user ${decoded.id}: No BYOK Claude key configured and global access is disabled.\n`,
          );
          res.statusCode = 403;
          res.end(
            JSON.stringify({
              error:
                "Access Denied: Global access is disabled. You must configure a valid Claude API key in your Account Settings to perform scans.",
            }),
          );
          return;
        }
      } catch (dbErr: any) {
        process.stderr.write(
          `[HTTP_CRASH] Failed to check user API key status: ${dbErr.message}\nStack: ${dbErr.stack}\n`,
        );
        process.stderr.write(
          `[RAW_ERROR_DUMP] ${JSON.stringify(dbErr, Object.getOwnPropertyNames(dbErr), 2)}\n`,
        );
        res.statusCode = 500;
        res.end(
          JSON.stringify({ error: "Database error during key validation." }),
        );
        return;
      }
    }
    // --- END BYOK AUTHORIZATION CHECK ---

    let resolvedModel: ClaudeModelId = "claude-sonnet-4-6";
    if (
      body.model === "claude-sonnet-4-6" ||
      body.model === "claude-opus-4-7" ||
      body.model === "claude-haiku-4-5"
    ) {
      resolvedModel = body.model;
    }

    try {
      // Create Database Record immediately
      const report = await claudeService.initializeReport(
        body.targetUrl,
        "repo",
        decoded.id,
        resolvedModel,
      );

      // Return 202 Accepted immediately
      res.statusCode = 202;
      res.end(
        JSON.stringify({
          message: "Git Repository Scan initialized. Processing in background.",
          reportId: report.id,
        }),
      );

      // Fire and Forget Background Worker
      claudeService
        .runBackgroundRepoScan(
          report.id,
          body.targetUrl,
          decoded.id,
          resolvedModel,
        )
        .catch((workerErr: any) => {
          process.stderr.write(
            `[FATAL_WORKER_ESCAPE] Git Worker failed to contain error: ${workerErr.message}\nStack: ${workerErr.stack}\n`,
          );
          process.stderr.write(
            `[RAW_ERROR_DUMP] ${JSON.stringify(workerErr, Object.getOwnPropertyNames(workerErr), 2)}\n`,
          );
        });
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_CRASH] Failed to initialize DB report: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: "Failed to initialize scan engine database row.",
        }),
      );
    }
  },

  // --- 3. FETCH SCAN HISTORY ---
  async getHistory(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json");

    // Extract Query Parameters from URL string natively
    const parsedUrl = new URL(
      req.url || "",
      `http://${req.headers.host || "localhost"}`,
    );
    const page = parseInt(parsedUrl.searchParams.get("page") || "1", 10);
    const limit = parseInt(parsedUrl.searchParams.get("limit") || "10", 10);
    const type = parsedUrl.searchParams.get("type") || "all";
    const timeframe = parsedUrl.searchParams.get("timeframe") || "all";

    process.stdout.write(
      `\n[HTTP] GET ${req.url} initialized (Page: ${page}, Type: ${type}, Time: ${timeframe})\n`,
    );

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized." }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid JWT: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized token." }));
      return;
    }

    try {
      const history = await claudeService.getReportsHistory(
        decoded.id,
        page,
        limit,
        type,
        timeframe,
      );
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          message: "History retrieved",
          data: history.data,
          meta: history.meta,
        }),
      );
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_CRASH] Failed fetching history: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 500;
      res.end(
        JSON.stringify({ error: "Internal error retrieving report history." }),
      );
    }
  },

  async getReport(
    req: IncomingMessage,
    res: ServerResponse,
    reportId: string,
  ): Promise<void> {
    res.setHeader("Content-Type", "application/json");

    // Extract pagination strictly for the findings array
    const parsedUrl = new URL(
      req.url || "",
      `http://${req.headers.host || "localhost"}`,
    );
    const page = parseInt(parsedUrl.searchParams.get("page") || "1", 10);
    const limit = parseInt(parsedUrl.searchParams.get("limit") || "10", 10);

    process.stdout.write(
      `\n[HTTP] GET ${req.url} initialized (Report: ${reportId}, Page: ${page})\n`,
    );

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized." }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid JWT: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized token." }));
      return;
    }

    try {
      const payload = await claudeService.getSingleReportData(
        reportId,
        decoded.id,
        page,
        limit,
      );
      if (!payload.report) {
        res.statusCode = 404;
        res.end(
          JSON.stringify({ error: "Report not found or access denied." }),
        );
        return;
      }

      res.statusCode = 200;
      res.end(
        JSON.stringify({ message: "Report details retrieved", data: payload }),
      );
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_CRASH] Failed fetching report details: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: "Internal error retrieving specific report details.",
        }),
      );
    }
  },

  async testConnection(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    res.setHeader("Content-Type", "application/json");

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized: Missing token." }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid JWT: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized token." }));
      return;
    }

    try {
      const telemetryData = await claudeService.testConnection(decoded.id);
      res.statusCode = 200;
      res.end(JSON.stringify(telemetryData));
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_REJECT] Connection test failed: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 400; // Client-side configuration error or API failure
      res.end(
        JSON.stringify({
          success: false,
          error: "Connection failed.",
          details: err.message,
        }),
      );
    }
  },
};
