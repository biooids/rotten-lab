//src/features/ai/claude/claude.controller.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "node:stream/consumers";
import jwt from "jsonwebtoken";
import { claudeService } from "./claude.service.js";
import type { ClaudeModelId, ScanRequestDTO } from "./claude.types.js";
import type { JWTPayload } from "../../auth/auth.types.js";

const ACCESS_TOKEN_SECRET = process.env["ACCESS_TOKEN_SECRET"];
const PORTFOLIO_SECRET_KEY = process.env["PORTFOLIO_SECRET_KEY"];

if (!ACCESS_TOKEN_SECRET || !PORTFOLIO_SECRET_KEY) {
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
      process.stderr.write(`[HTTP_REJECT] Invalid JWT: ${err.message}\n`);
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
    } catch {
      res.statusCode = 400;
      res.end(
        JSON.stringify({ error: "Malformed URL provided. Cannot scan." }),
      );
      return;
    }
    // --- END ADDED ---

    if (
      decoded.role === "user" &&
      body.secretAccessKey !== PORTFOLIO_SECRET_KEY
    ) {
      process.stderr.write(
        `[HTTP_SHIELD] Rejected standard user due to incorrect Portfolio Key.\n`,
      );
      res.statusCode = 403;
      res.end(
        JSON.stringify({
          error: "Access Denied: Valid Portfolio Key required.",
        }),
      );
      return;
    }

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
        .catch((workerErr) => {
          process.stderr.write(
            `[FATAL_WORKER_ESCAPE] URL Worker failed to contain error: ${workerErr.message}\n`,
          );
        });
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_CRASH] Failed to initialize DB report: ${err.message}\n`,
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
      process.stderr.write(`[HTTP_REJECT] Invalid JWT: ${err.message}\n`);
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
    } catch {
      res.statusCode = 400;
      res.end(
        JSON.stringify({ error: "Malformed URL provided. Cannot scan." }),
      );
      return;
    }
    // --- END ADDED ---

    if (
      decoded.role === "user" &&
      body.secretAccessKey !== PORTFOLIO_SECRET_KEY
    ) {
      process.stderr.write(
        `[HTTP_SHIELD] Rejected standard user due to incorrect Portfolio Key.\n`,
      );
      res.statusCode = 403;
      res.end(
        JSON.stringify({
          error: "Access Denied: Valid Portfolio Key required.",
        }),
      );
      return;
    }

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
        .catch((workerErr) => {
          process.stderr.write(
            `[FATAL_WORKER_ESCAPE] Git Worker failed to contain error: ${workerErr.message}\n`,
          );
        });
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_CRASH] Failed to initialize DB report: ${err.message}\n`,
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
        `[HTTP_CRASH] Failed fetching history: ${err.message}\n`,
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
        `[HTTP_CRASH] Failed fetching report details: ${err.message}\n`,
      );
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: "Internal error retrieving specific report details.",
        }),
      );
    }
  },
};
