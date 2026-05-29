import PDFDocument from "pdfkit";
import { pool } from "../../../db/psql.js";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  DatabaseReportContext,
  DatabaseFindingContext,
  ReportChatSession,
} from "./reports.types.js";

const GEMINI_API_KEY = process.env["GEMINI_API_KEY"];
const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"];

const gemini = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;
const anthropic = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

export const reportsService = {
  // --- 1. PDF GENERATOR ---
  async generateReportPdf(
    reportId: string,
    adminId: string,
  ): Promise<Buffer | null> {
    process.stdout.write(
      `[REPORTS_DB] Fetching scan report details for PDF Generation. ID: ${reportId}\n`,
    );

    let reportRes;
    try {
      const reportSql = `SELECT id, target_url, scan_type, ai_provider, ai_model, status, scanned_by, created_at FROM scan_reports WHERE id = $1 AND scanned_by = $2;`;
      reportRes = await pool.query(reportSql, [reportId, adminId]);
    } catch (dbErr: any) {
      process.stderr.write(
        `[FATAL_DB_ERROR] Failed fetching report details for PDF. Report ID: ${reportId}, Admin ID: ${adminId}. Error: ${dbErr.message}\nStack: ${dbErr.stack}\n`,
      );
      throw dbErr;
    }

    if (reportRes.rows.length === 0) {
      process.stderr.write(
        `[REPORTS_DB_MISS] Report not found or unauthorized for PDF generation.\n`,
      );
      return null;
    }
    const report = reportRes.rows[0] as DatabaseReportContext;

    let findingsRes;
    try {
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
      findingsRes = await pool.query(findingsSql, [reportId]);
    } catch (dbErr: any) {
      process.stderr.write(
        `[FATAL_DB_ERROR] Failed fetching findings for PDF. Report ID: ${reportId}. Error: ${dbErr.message}\nStack: ${dbErr.stack}\n`,
      );
      throw dbErr;
    }
    const findings = findingsRes.rows as DatabaseFindingContext[];

    return new Promise((resolve, reject) => {
      try {
        process.stdout.write(
          `[PDF_ENGINE] Initializing PDFKit Document engine...\n`,
        );

        const doc = new PDFDocument({ margin: 50, size: "A4" });
        const buffers: Buffer[] = [];

        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => {
          process.stdout.write(
            `[PDF_ENGINE_SUCCESS] Document finalized into memory.\n`,
          );
          resolve(Buffer.concat(buffers));
        });
        doc.on("error", (err) => {
          process.stderr.write(
            `[PDF_STREAM_ERROR] Chunk compilation failed during PDF generation: ${err.message}\n`,
          );
          reject(err);
        });

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

        for (let i = 0; i < findings.length; i++) {
          const f = findings[i]!;

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
          `[PDF_ENGINE_CRASH] Failed to compile document layout: ${pdfErr.message}\nStack: ${pdfErr.stack}\n`,
        );
        reject(pdfErr);
      }
    });
  },

  // --- 2. FETCH CHAT HISTORY ---
  async getChatHistory(
    reportId: string,
    userId: string,
    findingId: string,
  ): Promise<ReportChatSession[]> {
    process.stdout.write(
      `[CHAT_DB] Fetching isolated chat history for report: ${reportId}, finding: ${findingId}\n`,
    );
    try {
      const sql = `
        SELECT id, report_id, finding_id, user_id, role, message, created_at 
        FROM report_chats 
        WHERE report_id = $1 AND user_id = $2 AND finding_id = $3
        ORDER BY created_at ASC;
      `;
      const result = await pool.query(sql, [reportId, userId, findingId]);
      return result.rows as ReportChatSession[];
    } catch (err: any) {
      process.stderr.write(
        `[FATAL_DB_ERROR] Failed fetching chat history for report: ${reportId}, finding: ${findingId}. Error: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  // --- 3. PROCESS NEW CHAT MESSAGE ---
  async processChatMessage(
    reportId: string,
    userId: string,
    userMessage: string,
    findingId: string,
    selectedModel?: string,
  ): Promise<ReportChatSession> {
    process.stdout.write(
      `[CHAT_ENGINE] Processing new message for isolated finding: ${findingId} (RequestedModel: ${selectedModel || "Default"})\n`,
    );

    // 1. Verify Ownership & Get AI Provider
    let reportRes;
    try {
      const reportSql = `SELECT target_url, ai_provider FROM scan_reports WHERE id = $1 AND scanned_by = $2;`;
      reportRes = await pool.query(reportSql, [reportId, userId]);
    } catch (err: any) {
      process.stderr.write(
        `[FATAL_DB_ERROR] Failed resolving report ownership for report: ${reportId}, user: ${userId}. Error: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }

    if (reportRes.rows.length === 0) {
      process.stderr.write(
        `[CHAT_AUTH_ERROR] Report ${reportId} not found or user ${userId} does not own it.\n`,
      );
      throw new Error("NOT_FOUND");
    }

    const { target_url, ai_provider } = reportRes.rows[0];

    // 2. Validate Model against Provider
    let finalModel = "";
    if (ai_provider === "claude") {
      if (selectedModel && !selectedModel.toLowerCase().includes("claude")) {
        process.stderr.write(
          `[CHAT_VALIDATION_ERROR] Model mismatch. Provider is claude, requested: ${selectedModel}\n`,
        );
        throw new Error("MODEL_MISMATCH");
      }
      finalModel = selectedModel || "claude-3-haiku-20240307";
    } else if (ai_provider === "gemini") {
      if (selectedModel && !selectedModel.toLowerCase().includes("gemini")) {
        process.stderr.write(
          `[CHAT_VALIDATION_ERROR] Model mismatch. Provider is gemini, requested: ${selectedModel}\n`,
        );
        throw new Error("MODEL_MISMATCH");
      }
      finalModel = selectedModel || "gemini-2.5-flash";
    } else {
      process.stderr.write(
        `[CHAT_CRASH] Unknown AI Provider registered in DB: ${ai_provider}\n`,
      );
      throw new Error(`Unknown AI Provider registered: ${ai_provider}`);
    }

    // 3. Build Strict Context (Card Isolated)
    let systemContext = `You are a Senior Application Security Engineer assisting a developer with a security audit for the target: ${target_url}.\n`;

    let findingRes;
    try {
      const findingSql = `SELECT vulnerability_name, severity, file_path, code_snippet, ai_explanation, how_to_trigger, ai_fix_suggestion FROM scan_findings WHERE id = $1 AND report_id = $2;`;
      findingRes = await pool.query(findingSql, [findingId, reportId]);
    } catch (err: any) {
      process.stderr.write(
        `[FATAL_DB_ERROR] Failed resolving finding context for finding ID: ${findingId}. Error: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }

    if (findingRes.rows.length === 0) {
      process.stderr.write(
        `[CHAT_DATA_ERROR] Finding ID ${findingId} does not exist in Report ${reportId}.\n`,
      );
      throw new Error("FINDING_NOT_FOUND");
    }

    const f = findingRes.rows[0];
    systemContext += `\nThe user is asking specifically about THIS vulnerability finding from the audit:\n`;
    systemContext += `Rule: ${f.vulnerability_name} (${f.severity} severity)\n`;
    systemContext += `File Path: ${f.file_path}\n`;
    systemContext += `Code Snippet:\n${f.code_snippet}\n`;
    systemContext += `Explanation given by scanner: ${f.ai_explanation}\n`;
    systemContext += `Suggested Fix: ${f.ai_fix_suggestion}\n`;

    // 4. Save User Message to DB
    try {
      await pool.query(
        `INSERT INTO report_chats (report_id, finding_id, user_id, role, message) VALUES ($1, $2, $3, 'user', $4)`,
        [reportId, findingId, userId, userMessage],
      );
    } catch (err: any) {
      process.stderr.write(
        `[FATAL_DB_ERROR] Failed inserting user message into DB. Payload size: ${userMessage.length}. Error: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }

    // 5. Fetch past 6 messages for context window
    let history: ReportChatSession[] = [];
    try {
      history = await this.getChatHistory(reportId, userId, findingId);
    } catch (err: any) {
      process.stderr.write(
        `[CHAT_HISTORY_WARN] Failed to load chat history for context window. Proceeding with empty history. Error: ${err.message}\n`,
      );
    }
    const recentHistory = history.slice(-6);

    let aiReplyText = "";
    process.stdout.write(
      `[CHAT_API] Dispatching prompt to ${ai_provider} (Model: ${finalModel})\n`,
    );

    // 6. Route to correct provider with explicit error handling
    try {
      if (ai_provider === "claude") {
        if (!anthropic) {
          process.stderr.write(
            `[FATAL_CONFIG_ERROR] Anthropic client not configured in environment.\n`,
          );
          throw new Error("AI_CLIENT_NOT_CONFIGURED");
        }

        const messages = recentHistory.map((msg) => ({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.message,
        })) as { role: "user" | "assistant"; content: string }[];

        const response = await anthropic.messages.create({
          model: finalModel,
          max_tokens: 1024,
          system: systemContext,
          messages: messages,
        });

        const textBlock = response.content.find(
          (block) => block.type === "text",
        );
        aiReplyText =
          textBlock && "text" in textBlock
            ? textBlock.text
            : "I could not generate a response.";
      } else {
        if (!gemini) {
          process.stderr.write(
            `[FATAL_CONFIG_ERROR] Gemini client not configured in environment.\n`,
          );
          throw new Error("AI_CLIENT_NOT_CONFIGURED");
        }

        const contents = recentHistory.map((msg) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.message }],
        }));

        const response = await gemini.models.generateContent({
          model: finalModel,
          contents: contents,
          config: {
            systemInstruction: systemContext,
          },
        });

        aiReplyText = response.text || "I could not generate a response.";
      }
    } catch (aiErr: any) {
      process.stderr.write(
        `[FATAL_AI_ERROR] External API request to ${ai_provider} failed. Model: ${finalModel}. Error: ${aiErr.message}\nStack: ${aiErr.stack}\n`,
      );
      throw new Error("AI_API_FAILURE");
    }

    // --- DEFENSIVE SAFEGUARD: TRUNCATION BEFORE DB INSERT ---
    // If the DB constraint is 100000, we aggressively slice it at 99950 to leave guaranteed space for the system warning.
    if (aiReplyText.length > 99950) {
      process.stdout.write(
        `[CHAT_WARN] AI response generated ${aiReplyText.length} characters. Truncating payload to protect database check constraint.\n`,
      );
      aiReplyText =
        aiReplyText.substring(0, 99900) +
        "\n\n... [SYSTEM MESSAGE: AI output truncated for exceeding database character limits.]";
    }

    // 7. Save AI Response to DB
    let aiInsertRes;
    try {
      aiInsertRes = await pool.query(
        `INSERT INTO report_chats (report_id, finding_id, user_id, role, message) VALUES ($1, $2, $3, 'ai', $4) RETURNING *;`,
        [reportId, findingId, userId, aiReplyText],
      );
    } catch (err: any) {
      process.stderr.write(
        `[FATAL_DB_ERROR] Failed inserting AI response into DB. Truncated Payload Size: ${aiReplyText.length}. Error: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }

    process.stdout.write(
      `[CHAT_SUCCESS] Successfully generated and stored isolated AI reply for finding: ${findingId}\n`,
    );
    return aiInsertRes.rows[0] as ReportChatSession;
  },
};
