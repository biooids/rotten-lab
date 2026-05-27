// src/features/ai/reports/reports.service.ts
import PDFDocument from "pdfkit";
import { pool } from "../../../db/psql.js";
import type {
  DatabaseReportContext,
  DatabaseFindingContext,
} from "./reports.types.js";

export const reportsService = {
  async generateReportPdf(
    reportId: string,
    adminId: string,
  ): Promise<Buffer | null> {
    process.stdout.write(
      `[REPORTS_DB] Fetching scan report details for PDF Generation. ID: ${reportId}\n`,
    );

    // 1. Fetch the Parent Report strictly checking ownership
    const reportSql = `SELECT id, target_url, scan_type, ai_provider, ai_model, status, scanned_by, created_at FROM scan_reports WHERE id = $1 AND scanned_by = $2;`;
    const reportRes = await pool.query(reportSql, [reportId, adminId]);

    if (reportRes.rows.length === 0) {
      process.stderr.write(
        `[REPORTS_DB_MISS] Report not found or unauthorized.\n`,
      );
      return null;
    }
    const report = reportRes.rows[0] as DatabaseReportContext;

    // 2. Fetch all findings ordered by strict severity ranking
    const findingsSql = `
      SELECT vulnerability_name, severity, file_path, code_snippet, ai_explanation, how_to_trigger, ai_fix_suggestion 
      FROM scan_findings 
      WHERE report_id = $1 
      ORDER BY CASE severity 
        WHEN 'Critical' THEN 1 
        WHEN 'High' THEN 2 
        WHEN 'Medium' THEN 3 
        WHEN 'Low' THEN 4 
        ELSE 5 
      END;
    `;
    const findingsRes = await pool.query(findingsSql, [reportId]);
    const findings = findingsRes.rows as DatabaseFindingContext[];

    // 3. Build the PDF inside a Promise so we can return the raw buffer cleanly
    return new Promise((resolve, reject) => {
      try {
        process.stdout.write(
          `[PDF_ENGINE] Initializing PDFKit Document engine...\n`,
        );

        const doc = new PDFDocument({ margin: 50, size: "A4" });
        const buffers: Buffer[] = [];

        // Pipe stream directly into memory array
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => {
          process.stdout.write(
            `[PDF_ENGINE_SUCCESS] Document finalized into memory.\n`,
          );
          resolve(Buffer.concat(buffers));
        });
        doc.on("error", (err) => {
          reject(err);
        });

        // --- EXPLICIT DATA SANITIZATION ---
        // AI returns markdown. We must manually strip it so the PDF engine doesn't break
        const stripMarkdown = (text: string | null) => {
          if (!text) return "N/A";
          return text
            .replace(/\*\*/g, "")
            .replace(/\*/g, "")
            .replace(/```[\w]*\n/g, "")
            .replace(/```/g, "")
            .replace(/`/g, "")
            .trim();
        };

        // --- PDF STRUCTURAL LAYOUT ---
        // Header
        doc
          .fontSize(22)
          .font("Helvetica-Bold")
          .text("Application Security Audit", { align: "center" });
        doc.moveDown(0.5);

        doc
          .fontSize(12)
          .font("Helvetica")
          .text(`Target Root: ${report.target_url}`, { align: "center" });
        doc.text(`Engine Vector: ${report.scan_type.toUpperCase()}`, {
          align: "center",
        });
        doc.text(`LLM Analyst: ${report.ai_provider} (${report.ai_model})`, {
          align: "center",
        });
        doc.text(`Timestamp: ${new Date(report.created_at).toLocaleString()}`, {
          align: "center",
        });
        doc.moveDown(2);

        // Executive Summary
        doc.fontSize(16).font("Helvetica-Bold").text("Executive Summary");
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(1);

        doc
          .fontSize(12)
          .font("Helvetica")
          .text(`Total Vulnerabilities Identified: ${findings.length}`);
        doc.moveDown(2);

        if (findings.length === 0) {
          doc
            .fontSize(12)
            .font("Helvetica-Oblique")
            .text("No security anomalies detected during this sweep.");
        }

        // Iterate over vulnerabilities explicitly
        for (let i = 0; i < findings.length; i++) {
          const f = findings[i]!;

          // Pagination Logic: prevent cutting off titles
          if (doc.y > 680) doc.addPage();

          doc
            .fontSize(14)
            .font("Helvetica-Bold")
            .text(`${i + 1}. ${f.vulnerability_name}`);

          let severityColor = "black";
          if (f.severity === "Critical") severityColor = "darkred";
          if (f.severity === "High") severityColor = "red";
          if (f.severity === "Medium") severityColor = "orange";
          if (f.severity === "Low") severityColor = "green";

          doc
            .fontSize(12)
            .font("Helvetica-Bold")
            .fillColor(severityColor)
            .text(`Severity: ${f.severity}`);
          doc.fillColor("black");
          doc.moveDown(0.5);

          doc
            .fontSize(10)
            .font("Helvetica-Bold")
            .text("File Path / Location: ");
          doc.font("Helvetica").text(f.file_path || "Unknown vector path");
          doc.moveDown(0.5);

          doc
            .fontSize(10)
            .font("Helvetica-Bold")
            .text("Root Cause Explanation: ");
          doc
            .font("Helvetica")
            .text(stripMarkdown(f.ai_explanation), { align: "justify" });
          doc.moveDown(0.5);

          doc
            .fontSize(10)
            .font("Helvetica-Bold")
            .text("Exploitation Concept: ");
          doc
            .font("Helvetica")
            .text(stripMarkdown(f.how_to_trigger), { align: "justify" });
          doc.moveDown(0.5);

          doc
            .fontSize(10)
            .font("Helvetica-Bold")
            .text("Remediation Strategy: ");
          doc
            .font("Helvetica")
            .text(stripMarkdown(f.ai_fix_suggestion), { align: "justify" });
          doc.moveDown(1.5);

          doc
            .moveTo(50, doc.y)
            .lineTo(545, doc.y)
            .strokeColor("#e0e0e0")
            .stroke();
          doc.strokeColor("black");
          doc.moveDown(1);
        }

        doc.end();
      } catch (pdfErr: any) {
        process.stderr.write(
          `[PDF_ENGINE_CRASH] Failed to compile document layout: ${pdfErr.message}\n`,
        );
        reject(pdfErr);
      }
    });
  },
};
