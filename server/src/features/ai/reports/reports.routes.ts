//src/features/ai/reports/reports.routes.ts
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
  if (!pathname.startsWith("/api/v1/reports")) return false;

  // Route: GET /api/v1/reports/:id/pdf (Download Full Report)
  if (
    pathname.startsWith("/api/v1/reports/") &&
    pathname.endsWith("/pdf") &&
    req.method === "GET"
  ) {
    const reportId = pathname
      .replace("/api/v1/reports/", "")
      .replace("/pdf", "");

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reportId)) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid Report ID format for PDF: ${reportId}\n`,
      );
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid report ID format requested." }));
      return true;
    }

    await reportsController.downloadPdf(req, res, reportId);
    return true;
  }

  // --- PHASE 2 ROUTES: AI CHAT ---

  // Route: GET /api/v1/reports/:id/chat (Fetch History)
  if (
    pathname.startsWith("/api/v1/reports/") &&
    pathname.endsWith("/chat") &&
    req.method === "GET"
  ) {
    const reportId = pathname
      .replace("/api/v1/reports/", "")
      .replace("/chat", "");

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reportId)) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid Report ID format for Chat History: ${reportId}\n`,
      );
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid report ID format requested." }));
      return true;
    }

    await reportsController.getChatHistory(req, res, reportId);
    return true;
  }

  // Route: POST /api/v1/reports/:id/chat (Send Message)
  if (
    pathname.startsWith("/api/v1/reports/") &&
    pathname.endsWith("/chat") &&
    req.method === "POST"
  ) {
    const reportId = pathname
      .replace("/api/v1/reports/", "")
      .replace("/chat", "");

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reportId)) {
      process.stderr.write(
        `[HTTP_REJECT] Invalid Report ID format for Chat Message: ${reportId}\n`,
      );
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid report ID format requested." }));
      return true;
    }

    await reportsController.sendMessage(req, res, reportId);
    return true;
  }

  return false;
};
