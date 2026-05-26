//src/features/ai/gemini/gemini.routes.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { geminiController } from "./gemini.controller.js";

export const geminiRoutes = async ({
  req,
  res,
  pathname,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
}): Promise<boolean> => {
  // Guard clause: Exit instantly if not a Gemini route
  if (!pathname.startsWith("/api/v1/ai/gemini")) return false;

  // Route: POST /api/v1/ai/gemini/scan-url (Starts Async Job)
  if (pathname === "/api/v1/ai/gemini/scan-url" && req.method === "POST") {
    await geminiController.scanUrl(req, res);
    return true;
  }

  // Route: POST /api/v1/ai/gemini/scan-repo (Starts Async Job)
  if (pathname === "/api/v1/ai/gemini/scan-repo" && req.method === "POST") {
    await geminiController.scanRepo(req, res);
    return true;
  }

  // Route: GET /api/v1/ai/gemini/history (Fetch all past scans)
  if (pathname === "/api/v1/ai/gemini/history" && req.method === "GET") {
    await geminiController.getHistory(req, res);
    return true;
  }

  // Route: GET /api/v1/ai/gemini/report/:id (Polled by frontend to check status/data)
  if (
    pathname.startsWith("/api/v1/ai/gemini/report/") &&
    req.method === "GET"
  ) {
    // Extract the dynamic UUID from the path string
    const reportId = pathname.replace("/api/v1/ai/gemini/report/", "");

    // UUID basic format validation check to prevent junk querying
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reportId)) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid report ID format requested." }));
      return true;
    }

    await geminiController.getReport(req, res, reportId);
    return true;
  }

  return false;
};
