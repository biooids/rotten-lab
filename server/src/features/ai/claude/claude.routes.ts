//src/features/ai/claude/claude.routes.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { claudeController } from "./claude.controller.js";

export const claudeRoutes = async ({
  req,
  res,
  pathname,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
}): Promise<boolean> => {
  // Guard clause: Exit instantly if not a Claude route
  if (!pathname.startsWith("/api/v1/ai/claude")) return false;

  // Route: POST /api/v1/ai/claude/scan-url (Starts Async Job)
  if (pathname === "/api/v1/ai/claude/scan-url" && req.method === "POST") {
    await claudeController.scanUrl(req, res);
    return true;
  }

  // Route: POST /api/v1/ai/claude/scan-repo (Starts Async Job)
  if (pathname === "/api/v1/ai/claude/scan-repo" && req.method === "POST") {
    await claudeController.scanRepo(req, res);
    return true;
  }

  // Route: GET /api/v1/ai/claude/history (Fetch all past scans)
  if (pathname === "/api/v1/ai/claude/history" && req.method === "GET") {
    await claudeController.getHistory(req, res);
    return true;
  }

  // Route: GET /api/v1/ai/claude/report/:id (Polled by frontend to check status/data)
  if (
    pathname.startsWith("/api/v1/ai/claude/report/") &&
    req.method === "GET"
  ) {
    // Extract the dynamic UUID from the path string
    const reportId = pathname.replace("/api/v1/ai/claude/report/", "");

    // UUID basic format validation check to prevent junk querying
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reportId)) {
      // FIXED: Added missing server log so you can see why it failed
      process.stderr.write(
        `[HTTP_REJECT] Invalid Report ID format in Claude Router: ${reportId}\n`,
      );
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid report ID format requested." }));
      return true;
    }

    await claudeController.getReport(req, res, reportId);
    return true;
  }

  return false;
};
