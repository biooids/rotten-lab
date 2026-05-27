// src/features/ai/reports/reports.routes.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { reportsController } from "./reports.controller.js";

export const reportsRoutes = async ({
  req,
  res,
  pathname,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
}): Promise<boolean> => {
  // Guard clause: Exit instantly if not a reports route
  if (!pathname.startsWith("/api/v1/reports")) return false;

  // Route: GET /api/v1/reports/:id/pdf (Download Full Report)
  if (
    pathname.startsWith("/api/v1/reports/") &&
    pathname.endsWith("/pdf") &&
    req.method === "GET"
  ) {
    // Extract the dynamic UUID from the path string
    const reportId = pathname
      .replace("/api/v1/reports/", "")
      .replace("/pdf", "");

    // Strict Fail-Fast Validation: Matches exact logic from your AI controllers
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reportId)) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid report ID format requested." }));
      return true;
    }

    await reportsController.downloadPdf(req, res, reportId);
    return true;
  }

  // --- PHASE 2 ROUTES (Placeholder for AI Chat, do not implement yet) ---
  /*
  if (pathname.startsWith("/api/v1/reports/") && pathname.endsWith("/chat") && req.method === "GET") {
     // get chat history logic will go here
  }
  if (pathname.startsWith("/api/v1/reports/") && pathname.endsWith("/chat") && req.method === "POST") {
     // send new chat message logic will go here
  }
  */

  return false;
};
