//src/features/ai/reports/reports.controller.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "node:stream/consumers";
import jwt from "jsonwebtoken";
import { reportsService } from "./reports.service.js";
import type { JWTPayload } from "../../auth/auth.types.js";
import type { ChatMessageRequestDTO } from "./reports.types.js";

const ACCESS_TOKEN_SECRET = process.env["ACCESS_TOKEN_SECRET"];

if (!ACCESS_TOKEN_SECRET) {
  process.stderr.write(
    "FATAL RUNTIME CONFIG ERROR: Environment keys unassigned for Reports Controller.\n",
  );
  process.exit(1);
}

export const reportsController = {
  // --- 1. DOWNLOAD PDF REPORT ENTRY POINT ---
  async downloadPdf(
    req: IncomingMessage,
    res: ServerResponse,
    reportId: string,
  ): Promise<void> {
    process.stdout.write(
      `\n[HTTP] GET /api/v1/reports/${reportId}/pdf initialized\n`,
    );

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      process.stderr.write(`[HTTP_REJECT] Missing Bearer token.\n`);
      res.setHeader("Content-Type", "application/json");
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
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 401;
      res.end(
        JSON.stringify({ error: "Unauthorized: Invalid or expired token." }),
      );
      return;
    }

    try {
      const pdfBuffer = await reportsService.generateReportPdf(
        reportId,
        decoded.id,
      );

      if (!pdfBuffer) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 404;
        res.end(
          JSON.stringify({ error: "Report not found or access denied." }),
        );
        return;
      }

      process.stdout.write(
        `[HTTP_SUCCESS] Streaming binary PDF Buffer (${pdfBuffer.length} bytes) to client network pipe.\n`,
      );

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Security_Audit_Report_${reportId.substring(0, 8)}.pdf"`,
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      res.statusCode = 200;

      res.end(pdfBuffer);
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_CRASH] Failed to generate PDF in controller: ${err.message}\nStack: ${err.stack}\n`,
      );
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error:
            "Internal server error occurred while rendering the PDF document.",
        }),
      );
    }
  },

  // --- 2. GET CHAT HISTORY ---
  async getChatHistory(
    req: IncomingMessage,
    res: ServerResponse,
    reportId: string,
  ): Promise<void> {
    process.stdout.write(
      `\n[HTTP] GET /api/v1/reports/${reportId}/chat initialized\n`,
    );
    res.setHeader("Content-Type", "application/json");

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
      res.end(JSON.stringify({ error: "Unauthorized token." }));
      return;
    }

    const url = new URL(
      req.url || "",
      `http://${req.headers.host || "localhost"}`,
    );
    const findingId = url.searchParams.get("findingId");

    if (!findingId || findingId.trim() === "") {
      process.stderr.write(
        `[HTTP_REJECT] Missing findingId query parameter.\n`,
      );
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error: "findingId query parameter is strictly required for chat.",
        }),
      );
      return;
    }

    try {
      const history = await reportsService.getChatHistory(
        reportId,
        decoded.id,
        findingId,
      );
      res.statusCode = 200;
      res.end(JSON.stringify({ history }));
    } catch (err: any) {
      process.stderr.write(
        `[HTTP_CRASH] Failed fetching chat history in controller: ${err.message}\nStack: ${err.stack}\n`,
      );
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal server error." }));
    }
  },

  // --- 3. SEND CHAT MESSAGE ---
  async sendMessage(
    req: IncomingMessage,
    res: ServerResponse,
    reportId: string,
  ): Promise<void> {
    process.stdout.write(
      `\n[HTTP] POST /api/v1/reports/${reportId}/chat initialized\n`,
    );
    res.setHeader("Content-Type", "application/json");

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
      res.end(JSON.stringify({ error: "Unauthorized token." }));
      return;
    }

    let body: ChatMessageRequestDTO;
    try {
      body = (await json(req)) as ChatMessageRequestDTO;
    } catch (err: any) {
      process.stderr.write(`[HTTP_REJECT] Invalid JSON body.\n`);
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON body payload." }));
      return;
    }

    if (!body.message || body.message.trim() === "") {
      process.stderr.write(`[HTTP_REJECT] Empty message payload.\n`);
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Message cannot be empty." }));
      return;
    }

    if (!body.findingId || body.findingId.trim() === "") {
      process.stderr.write(`[HTTP_REJECT] Missing findingId in payload.\n`);
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error: "findingId payload is strictly required for chat.",
        }),
      );
      return;
    }

    try {
      const aiResponse = await reportsService.processChatMessage(
        reportId,
        decoded.id,
        body.message,
        body.findingId,
        body.selectedModel,
      );

      res.statusCode = 200;
      res.end(JSON.stringify(aiResponse));
    } catch (err: any) {
      if (err.message === "NOT_FOUND") {
        process.stderr.write(
          `[HTTP_REJECT] Chat report not found or unauthorized access: ${reportId}\n`,
        );
        res.statusCode = 404;
        res.end(
          JSON.stringify({ error: "Report not found or access denied." }),
        );
        return;
      }

      if (err.message === "FINDING_NOT_FOUND") {
        process.stderr.write(
          `[HTTP_REJECT] Vulnerability context ID not found in report.\n`,
        );
        res.statusCode = 404;
        res.end(
          JSON.stringify({ error: "Vulnerability finding context not found." }),
        );
        return;
      }

      if (err.message === "MODEL_MISMATCH") {
        process.stderr.write(
          `[HTTP_REJECT] Attempted to use conflicting AI provider model.\n`,
        );
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error:
              "Selected model does not match the AI provider used for this report.",
          }),
        );
        return;
      }

      if (err.message === "AI_API_FAILURE") {
        process.stderr.write(
          `[HTTP_REJECT] AI provider API failed to respond properly.\n`,
        );
        res.statusCode = 502;
        res.end(
          JSON.stringify({
            error:
              "The AI provider (Gemini/Claude) failed to process the request. They might be experiencing downtime or rate limiting.",
          }),
        );
        return;
      }

      if (err.message === "AI_CLIENT_NOT_CONFIGURED") {
        process.stderr.write(
          `[HTTP_REJECT] AI client configuration missing in environment.\n`,
        );
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: "Server configuration error: AI provider keys are missing.",
          }),
        );
        return;
      }

      process.stderr.write(
        `[HTTP_CRASH] Unhandled exception processing AI chat message: ${err.message}\nStack: ${err.stack}\n`,
      );
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: "Internal server error communicating with AI.",
        }),
      );
    }
  },
};
