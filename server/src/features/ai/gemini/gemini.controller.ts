//src/features/ai/gemini/gemini.controller.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "node:stream/consumers";
import jwt from "jsonwebtoken";
import { geminiService } from "./gemini.service.js";
import type { GeminiModelId, ScanRequestDTO } from "./gemini.types.js";
import type { JWTPayload } from "../../auth/auth.types.js";
import { pool } from "../../../db/psql.js";
import { DEFAULT_GEMINI_MODEL, VALID_GEMINI_MODELS } from "./gemini.config.js";

const ACCESS_TOKEN_SECRET = process.env["ACCESS_TOKEN_SECRET"];

if (!ACCESS_TOKEN_SECRET) {
  process.stderr.write(
    "FATAL RUNTIME CONFIG ERROR: Environment keys unassigned for Gemini.\n",
  );
  process.exit(1);
}

export const geminiController = {
  // --- 1. ASYNC URL SCANNER ENTRY POINT ---
  // --- 1. ASYNC URL SCANNER ENTRY POINT ---
  async scanUrl(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json");
    process.stdout.write(
      `\n[HTTP] POST /api/v1/ai/gemini/scan-url initialized\n`,
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

    // --- ADDED: BYOK & GRANULAR ROLE AUTHORIZATION CHECK ---
    // MODIFIED: Removed the "if (decoded.role === 'user')" check wrapper.
    // We now explicitly query the DB for ALL users (including admins) to accurately determine which keyType they will use before initializing the report.
    let keyType: "global" | "personal" = "global"; // Default fallback

    try {
      // MODIFIED: Added u.role and u.prefer_system_ai_key to correctly replicate routing logic
      const keyCheckSql = `
        SELECT 
          u.role,
          u.gemini_api_key,
          u.has_system_ai_access,
          u.prefer_system_ai_key,
          (SELECT allow_global_gemini FROM system_settings WHERE id = 1) AS allow_global_gemini
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
        userData.gemini_api_key && userData.gemini_api_key.trim() !== "";
      const hasGlobalAccess = userData.allow_global_gemini === true;
      const hasIndividualAiAccess = userData.has_system_ai_access === true;
      const isAdmin =
        userData.role === "admin" || userData.role === "super_admin";
      const isSystemAllowed =
        isAdmin || hasGlobalAccess || hasIndividualAiAccess;

      // MODIFIED: We still reject standard users if they lack a personal key AND lack all system access
      if (
        !isAdmin &&
        !hasPersonalKey &&
        !hasGlobalAccess &&
        !hasIndividualAiAccess
      ) {
        process.stderr.write(
          `[HTTP_SHIELD] Rejected standard user ${decoded.id}: No BYOK Gemini key configured and global/individual access is denied.\n`,
        );
        res.statusCode = 403;
        res.end(
          JSON.stringify({
            error:
              "Access Denied: You do not have permission to use the system AI engine. You must configure a valid Gemini API key in your Account Settings.",
          }),
        );
        return;
      }

      // MODIFIED: Exact logic matching the service file to determine token billing keyType explicitly
      if (userData.prefer_system_ai_key === true && isSystemAllowed) {
        keyType = "global";
      } else if (hasPersonalKey) {
        keyType = "personal";
      } else if (isAdmin) {
        keyType = "global";
      } else if (hasGlobalAccess || hasIndividualAiAccess) {
        keyType = "global";
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
    // --- END BYOK AUTHORIZATION CHECK ---

    let resolvedModel: GeminiModelId = DEFAULT_GEMINI_MODEL;
    if (body.model && VALID_GEMINI_MODELS.includes(body.model as any)) {
      resolvedModel = body.model;
    }

    try {
      // Create Database Record immediately
      const report = await geminiService.initializeReport(
        body.targetUrl,
        "url",
        decoded.id,
        resolvedModel,
        keyType, // MODIFIED: Added resolved 5th argument
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
      geminiService
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
  // --- 2. ASYNC REPO SCANNER ENTRY POINT ---
  async scanRepo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json");
    process.stdout.write(
      `\n[HTTP] POST /api/v1/ai/gemini/scan-repo initialized\n`,
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

    // --- ADDED: BYOK & GRANULAR ROLE AUTHORIZATION CHECK ---
    // MODIFIED: Removed the "if (decoded.role === 'user')" check wrapper.
    // We now explicitly query the DB for ALL users (including admins) to accurately determine which keyType they will use before initializing the report.
    let keyType: "global" | "personal" = "global"; // Default fallback

    try {
      // MODIFIED: Added u.role and u.prefer_system_ai_key to correctly replicate routing logic
      const keyCheckSql = `
        SELECT 
          u.role,
          u.gemini_api_key,
          u.has_system_ai_access,
          u.prefer_system_ai_key,
          (SELECT allow_global_gemini FROM system_settings WHERE id = 1) AS allow_global_gemini
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
        userData.gemini_api_key && userData.gemini_api_key.trim() !== "";
      const hasGlobalAccess = userData.allow_global_gemini === true;
      const hasIndividualAiAccess = userData.has_system_ai_access === true;
      const isAdmin =
        userData.role === "admin" || userData.role === "super_admin";
      const isSystemAllowed =
        isAdmin || hasGlobalAccess || hasIndividualAiAccess;

      // MODIFIED: We still reject standard users if they lack a personal key AND lack all system access
      if (
        !isAdmin &&
        !hasPersonalKey &&
        !hasGlobalAccess &&
        !hasIndividualAiAccess
      ) {
        process.stderr.write(
          `[HTTP_SHIELD] Rejected standard user ${decoded.id}: No BYOK Gemini key configured and global/individual access is denied.\n`,
        );
        res.statusCode = 403;
        res.end(
          JSON.stringify({
            error:
              "Access Denied: You do not have permission to use the system AI engine. You must configure a valid Gemini API key in your Account Settings.",
          }),
        );
        return;
      }

      // MODIFIED: Exact logic matching the service file to determine token billing keyType explicitly
      if (userData.prefer_system_ai_key === true && isSystemAllowed) {
        keyType = "global";
      } else if (hasPersonalKey) {
        keyType = "personal";
      } else if (isAdmin) {
        keyType = "global";
      } else if (hasGlobalAccess || hasIndividualAiAccess) {
        keyType = "global";
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
    // --- END BYOK AUTHORIZATION CHECK ---

    let resolvedModel: GeminiModelId = DEFAULT_GEMINI_MODEL;
    if (body.model && VALID_GEMINI_MODELS.includes(body.model as any)) {
      resolvedModel = body.model;
    }
    try {
      // Create Database Record immediately
      const report = await geminiService.initializeReport(
        body.targetUrl,
        "repo",
        decoded.id,
        resolvedModel,
        keyType, // MODIFIED: Added resolved 5th argument
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
      geminiService
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
      const history = await geminiService.getReportsHistory(
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

  // --- 4. FETCH SPECIFIC REPORT STATUS/DATA (POLLING ENDPOINT) ---
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
      const payload = await geminiService.getSingleReportData(
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
      const telemetryData = await geminiService.testConnection(decoded.id);
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
  // --- ADD THIS NEW METHOD TO geminiController ---
  async cancelScan(
    req: IncomingMessage,
    res: ServerResponse,
    reportId: string,
  ): Promise<void> {
    res.setHeader("Content-Type", "application/json");
    process.stdout.write(
      `\n[HTTP] POST /api/v1/ai/gemini/report/${reportId}/cancel initialized\n`,
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

    try {
      // We must ensure the user owns the report they are trying to cancel
      const updateSql = `
        UPDATE scan_reports 
        SET status = 'cancelled', status_message = 'Scan aborted by user.', updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1 AND scanned_by = $2
        RETURNING id;
      `;
      const updateRes = await pool.query(updateSql, [reportId, decoded.id]);

      if (updateRes.rows.length === 0) {
        process.stderr.write(
          `[HTTP_SHIELD] Cancel rejected: Report ${reportId} not found or not owned by user ${decoded.id}.\n`,
        );
        res.statusCode = 404;
        res.end(
          JSON.stringify({
            error:
              "Report not found or you do not have permission to cancel it.",
          }),
        );
        return;
      }

      process.stdout.write(
        `[HTTP_SUCCESS] Report ${reportId} cancelled by user ${decoded.id}.\n`,
      );
      res.statusCode = 200;
      res.end(JSON.stringify({ message: "Scan cancelled successfully." }));
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_CRASH] Failed to cancel report in database: ${err.message}\nStack: ${err.stack}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );
      res.statusCode = 500;
      res.end(
        JSON.stringify({ error: "Internal error while cancelling scan." }),
      );
    }
  },
};
