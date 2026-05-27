//src/features/ai/reports/reports.controller.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import jwt from "jsonwebtoken";
import { reportsService } from "./reports.service.js";
import type { JWTPayload } from "../../auth/auth.types.js";

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

    // --- MANUAL AUTHENTICATION ENFORCEMENT ---
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
      // Pass execution to service layer, enforcing access control strictly by admin ID
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

      // Native Node.js Headers to force browser to download the buffer as a physical file
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
        `[HTTP_CRASH] Failed to generate PDF: ${err.message}\nStack: ${err.stack}\n`,
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
};
