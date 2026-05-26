//src/features/ai/gemini/gemini.service.ts
import { GoogleGenAI, Type } from "@google/genai";
import { pool } from "../../../db/psql.js";
import { gitScannerService } from "../../core-scanners/gitScanner.service.js";
import { webScannerService } from "../../core-scanners/webScanner.service.js";
import type {
  GeminiModelId,
  DatabaseScanReport,
  BulkGeminiFindingResponse,
} from "./gemini.types.js";

const GEMINI_API_KEY = process.env["GEMINI_API_KEY"];

if (!GEMINI_API_KEY) {
  process.stderr.write(
    "FATAL RUNTIME CONFIG ERROR: GEMINI_API_KEY variable context layer unassigned.\n",
  );
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const geminiService = {
  async initializeReport(
    targetUrl: string,
    scanType: "url" | "repo",
    adminId: string,
    model: GeminiModelId,
  ): Promise<DatabaseScanReport> {
    process.stdout.write(
      `[GEMINI_DB_INIT] Committing new parent report row with status PENDING for target: ${targetUrl} (model=${model})\n`,
    );

    const masterSql = `
      INSERT INTO scan_reports (target_url, scan_type, ai_provider, ai_model, scanned_by, status, engine_warnings)
      VALUES ($1, $2, 'gemini', $3, $4, 'pending', '{}')
      RETURNING *;
    `;
    const result = await pool.query(masterSql, [
      targetUrl,
      scanType,
      model,
      adminId,
    ]);
    const report = result.rows[0] as DatabaseScanReport;

    process.stdout.write(
      `[GEMINI_DB_SUCCESS] Report generated. UUID: ${report.id}\n`,
    );
    return report;
  },

  async runBackgroundUrlScan(
    reportId: string,
    targetUrl: string,
    adminId: string,
    model: GeminiModelId,
  ): Promise<void> {
    try {
      process.stdout.write(
        `[BACKGROUND_WORKER] Starting URL background execution for Report ID: ${reportId} (provider=gemini model=${model})\n`,
      );
      await pool.query(
        `UPDATE scan_reports SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [reportId],
      );

      const rawVulnerabilities = await webScannerService.runScan(targetUrl);

      if (rawVulnerabilities.length === 0) {
        process.stdout.write(
          `[BACKGROUND_WORKER] 0 vulnerabilities found by Playwright web crawl queue spider. Marking complete.\n`,
        );
        await pool.query(
          `UPDATE scan_reports SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [reportId],
        );
        return;
      }

      await this.processBulkGeminiCall(
        reportId,
        rawVulnerabilities,
        "url",
        adminId,
        model,
      );
    } catch (err: any) {
      process.stderr.write(
        `[BACKGROUND_CRASH_URL] Background worker failed | reportId=${reportId} adminId=${adminId} provider=gemini model=${model} | ${err?.constructor?.name || "Error"}: ${err?.message || err}\nStack: ${err?.stack || "no stack"}\n`,
      );
      await pool.query(
        `
        UPDATE scan_reports
        SET status = 'failed',
            engine_warnings = array_append(engine_warnings, $1),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
        [`Web Scanner Engine Crash: ${err.message}`, reportId],
      );
    }
  },

  async runBackgroundRepoScan(
    reportId: string,
    targetUrl: string,
    adminId: string,
    model: GeminiModelId,
  ): Promise<void> {
    try {
      process.stdout.write(
        `[BACKGROUND_WORKER] Starting Git background execution loop matching Semgrep and Framework Analysis for Report ID: ${reportId} (provider=gemini model=${model})\n`,
      );
      await pool.query(
        `UPDATE scan_reports SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [reportId],
      );

      const scanOutputs = await gitScannerService.runScan(targetUrl);
      const rawVulnerabilities = scanOutputs.findings;
      const extractedProjectDependenciesContext = scanOutputs.context;

      if (rawVulnerabilities.length === 0) {
        process.stdout.write(
          `[BACKGROUND_WORKER] 0 security vulnerabilities identified by AST engine structural check logic ruleset. Marking complete.\n`,
        );
        await pool.query(
          `UPDATE scan_reports SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [reportId],
        );
        return;
      }

      await this.processBulkGeminiCall(
        reportId,
        rawVulnerabilities,
        "repo",
        adminId,
        model,
        extractedProjectDependenciesContext,
      );
    } catch (err: any) {
      process.stderr.write(
        `[BACKGROUND_CRASH_REPO] Git worker failed | reportId=${reportId} adminId=${adminId} provider=gemini model=${model} | ${err?.constructor?.name || "Error"}: ${err?.message || err}\nStack: ${err?.stack || "no stack"}\n`,
      );
      await pool.query(
        `
        UPDATE scan_reports
        SET status = 'failed',
            engine_warnings = array_append(engine_warnings, $1),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
        [`Git Semgrep System Scanner Engine Crash: ${err.message}`, reportId],
      );
    }
  },

  async processBulkGeminiCall(
    reportId: string,
    rawFindings: Array<{
      file_path: string;
      vulnerability_name: string;
      severity: string;
      code_snippet: string;
    }>,
    scanType: "url" | "repo",
    adminId: string,
    model: GeminiModelId,
    projectContext?: string,
  ): Promise<void> {
    const aiStartTime = Date.now();
    process.stdout.write(
      `[GEMINI_BULK_START] Compiling ${rawFindings.length} findings into a single AI prompt structure execution loop.\n`,
    );

    const structuredPayload = rawFindings.map((finding, index) => ({
      reference_id: index,
      file_path: finding.file_path,
      rule: finding.vulnerability_name,
      severity: finding.severity,
      snippet: finding.code_snippet,
    }));

    let contextualSystemBaseInstruction = `You are a Senior Application Security Engineer. You will receive a JSON array of raw code vulnerabilities. You must analyze each one and return a strictly formatted JSON array containing the exact remediation steps for each item, mapped by its 'reference_id'. Do not miss any items. You MUST return ONLY valid JSON, starting with [ and ending with ], with no markdown blocks, no prose preamble, and no commentary outside the JSON array.`;

    if (projectContext && projectContext.trim().length > 0) {
      contextualSystemBaseInstruction = `${contextualSystemBaseInstruction}\n\nCRITICAL ARCHITECTURE INFORMATION: The code repository ecosystem relies heavily on the following package environment dependencies context list configuration details: ${projectContext}. You MUST structure all how_to_fix suggestions to cleanly utilize native APIs, patterns, and features belonging strictly to these framework dependency architectures instead of giving generalized vanilla textbook solution guidelines.`;
    }

    const runtimePrompt = `
      Analyze this array of flagged vulnerabilities:
      ${JSON.stringify(structuredPayload, null, 2)}
      
      Return a JSON array of objects. Each object must contain:
      - reference_id: The exact integer from the input.
      - explanation: Technical root cause analysis.
      - how_to_trigger: How an attacker would exploit this.
      - how_to_fix: Concrete code/configuration remediation.
    `;

    try {
      process.stdout.write(
        `[GEMINI_API_EXECUTE] Transmitting bulk JSON prompt structure data elements to ${model} model interface...\n`,
      );
      const response = await ai.models.generateContent({
        model,
        contents: runtimePrompt,
        config: {
          systemInstruction: contextualSystemBaseInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                reference_id: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
                how_to_trigger: { type: Type.STRING },
                how_to_fix: { type: Type.STRING },
              },
              required: [
                "reference_id",
                "explanation",
                "how_to_trigger",
                "how_to_fix",
              ],
            },
          },
        },
      });

      const usage = response.usageMetadata;
      const promptTokens = usage?.promptTokenCount ?? 0;
      const completionTokens = usage?.candidatesTokenCount ?? 0;
      const totalTokens = usage?.totalTokenCount ?? 0;

      process.stdout.write(
        `[GEMINI_API_SUCCESS] Bulk analysis complete. Cost: ${totalTokens} tokens. Saving logs to tracking metrics...\n`,
      );

      await pool.query(
        `
        INSERT INTO ai_token_logs (admin_id, model_used, prompt_tokens, completion_tokens, total_tokens, action_type)
        VALUES ($1, $2, $3, $4, $5, $6);
      `,
        [
          adminId,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          scanType === "url" ? "URL_SCAN" : "REPO_SCAN",
        ],
      );

      if (!response.text) {
        throw new Error("AI completed but returned an empty response string.");
      }

      // Local try/catch around JSON.parse so we can distinguish "Gemini broke JSON contract"
      // from "Google API returned an error". Even with responseMimeType: application/json,
      // Gemini occasionally emits a markdown-wrapped or truncated payload, especially when
      // the prompt is at the edge of the context window. Capture the first 500 chars so we
      // can debug prompts, and write a SPECIFIC engine_warning so the user can retry.
      let aiResultsArray: BulkGeminiFindingResponse[];
      try {
        aiResultsArray = JSON.parse(response.text) as BulkGeminiFindingResponse[];
      } catch (parseErr: any) {
        process.stderr.write(
          `[GEMINI_RESPONSE_PARSE_FAIL] reportId=${reportId} provider=gemini model=${model} | ${parseErr?.constructor?.name || "SyntaxError"}: ${parseErr?.message}\n` +
            `[GEMINI_RESPONSE_PARSE_FAIL] First 500 chars of returned text: ${response.text.substring(0, 500)}\n`,
        );
        await pool.query(
          `
          UPDATE scan_reports
          SET status = 'failed',
              engine_warnings = array_append(engine_warnings, $1),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
          [
            `Gemini returned a response that wasn't valid JSON. This is intermittent — please retry the scan. (parser said: ${parseErr?.message?.substring(0, 200)})`,
            reportId,
          ],
        );
        return;
      }

      process.stdout.write(
        `[GEMINI_DB_WRITE] Writing ${aiResultsArray.length} parsed analytical findings to PostgreSQL context layers...\n`,
      );

      // Track returned vs requested reference_ids so we can flag any findings Gemini
      // silently dropped — the user deserves to know if the scanner found 6 things and
      // the AI only enriched 4 of them.
      const returnedReferenceIds = new Set<number>();
      for (const aiResult of aiResultsArray) {
        const originalRawFinding = rawFindings[aiResult.reference_id];
        if (!originalRawFinding) {
          process.stderr.write(
            `[GEMINI_REF_ID_INVALID] reportId=${reportId} reference_id=${aiResult.reference_id} not present in input findings (input count=${rawFindings.length}). Skipping.\n`,
          );
          continue;
        }
        returnedReferenceIds.add(aiResult.reference_id);

        await pool.query(
          `
          INSERT INTO scan_findings (
            report_id, file_path, vulnerability_name, severity,
            code_snippet, ai_explanation, how_to_trigger, ai_fix_suggestion
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `,
          [
            reportId,
            originalRawFinding.file_path,
            originalRawFinding.vulnerability_name,
            originalRawFinding.severity,
            originalRawFinding.code_snippet,
            aiResult.explanation,
            aiResult.how_to_trigger,
            aiResult.how_to_fix,
          ],
        );
      }

      const droppedFindings: string[] = [];
      for (let i = 0; i < rawFindings.length; i++) {
        if (!returnedReferenceIds.has(i)) {
          const dropped = rawFindings[i];
          if (dropped) {
            droppedFindings.push(
              `${dropped.vulnerability_name} @ ${dropped.file_path}`,
            );
          }
        }
      }
      if (droppedFindings.length > 0) {
        process.stderr.write(
          `[GEMINI_FINDINGS_DROPPED] reportId=${reportId} provider=gemini model=${model} | AI returned ${aiResultsArray.length} of ${rawFindings.length} input findings. Dropped: ${droppedFindings.join("; ").substring(0, 400)}\n`,
        );
        await pool.query(
          `
          UPDATE scan_reports
          SET engine_warnings = array_append(engine_warnings, $1),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
          [
            `AI returned ${aiResultsArray.length} of ${rawFindings.length} findings. ${droppedFindings.length} item(s) were dropped without analysis: ${droppedFindings.slice(0, 5).join("; ")}${droppedFindings.length > 5 ? "; ..." : ""}`,
            reportId,
          ],
        );
      }

      process.stdout.write(
        `[BACKGROUND_WORKER_SUCCESS] Scan ID ${reportId} completely successfully in ${Date.now() - aiStartTime}ms.\n`,
      );
      await pool.query(
        `UPDATE scan_reports SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [reportId],
      );
    } catch (aiErr: any) {
      // Inspect the upstream Google GenAI SDK error so the user gets actionable feedback.
      // Google's errors expose .status (HTTP code), sometimes .code, and may include a
      // structured .error.status string like "PERMISSION_DENIED" / "RESOURCE_EXHAUSTED".
      // Map each known case to a clear user-facing engine_warning instead of dumping the
      // raw 400/403/429 message.
      const httpStatus = aiErr?.status ?? aiErr?.response?.status ?? null;
      const googleStatus = aiErr?.error?.status ?? aiErr?.code ?? null;
      const errMsgLower = String(aiErr?.message || "").toLowerCase();

      let category = "UNKNOWN";
      let userFacingHint = `Unexpected failure during Gemini bulk processing: ${aiErr?.message || "no message"}`;

      if (
        httpStatus === 401 ||
        googleStatus === "UNAUTHENTICATED" ||
        errMsgLower.includes("api key not valid") ||
        errMsgLower.includes("api key expired")
      ) {
        category = "AUTH_FAILED";
        userFacingHint =
          "Gemini API key is invalid or expired. The server administrator needs to rotate GEMINI_API_KEY.";
      } else if (
        httpStatus === 403 ||
        googleStatus === "PERMISSION_DENIED" ||
        errMsgLower.includes("does not have access") ||
        errMsgLower.includes("permission")
      ) {
        category = "PERMISSION_DENIED";
        userFacingHint = `Your Gemini API key doesn't have access to the model "${model}". This typically means you're on the free tier and selected a paid-tier model (e.g. Pro). Switch to gemini-2.5-flash, or upgrade your Google AI plan.`;
      } else if (
        httpStatus === 404 ||
        googleStatus === "NOT_FOUND" ||
        errMsgLower.includes("model not found") ||
        errMsgLower.includes("does not exist")
      ) {
        category = "MODEL_NOT_FOUND";
        userFacingHint = `Google doesn't recognize the model "${model}". This model may have been deprecated — pick a different one from the picker.`;
      } else if (
        httpStatus === 429 ||
        googleStatus === "RESOURCE_EXHAUSTED" ||
        errMsgLower.includes("quota") ||
        errMsgLower.includes("rate limit")
      ) {
        category = "QUOTA_EXCEEDED";
        userFacingHint =
          "Gemini quota or rate limit exceeded on this API key. If you're on the free tier you've hit your daily cap — wait until tomorrow or switch to Claude.";
      } else if (
        httpStatus === 400 ||
        googleStatus === "INVALID_ARGUMENT"
      ) {
        category = "BAD_REQUEST";
        userFacingHint = `Google rejected the request as malformed: ${aiErr?.message?.substring(0, 200) || "no detail"}. This is usually a server bug — please report it.`;
      } else if (typeof httpStatus === "number" && httpStatus >= 500) {
        category = "PROVIDER_5XX";
        userFacingHint =
          "Google's Gemini API returned a 5xx server error. Not your fault — retry in a minute.";
      } else if (
        aiErr?.code === "ECONNREFUSED" ||
        aiErr?.code === "ENOTFOUND" ||
        aiErr?.code === "ETIMEDOUT" ||
        aiErr?.name === "AbortError"
      ) {
        category = "NETWORK";
        userFacingHint =
          "Couldn't reach Google's Gemini API (network error). Check the server's internet connection and retry.";
      }

      process.stderr.write(
        `[GEMINI_BULK_CRASH] reportId=${reportId} adminId=${adminId} provider=gemini model=${model} category=${category} status=${httpStatus} googleStatus=${googleStatus} sdkClass=${aiErr?.constructor?.name || "n/a"} | ${aiErr?.message || "no message"}\nStack: ${aiErr?.stack || "no stack"}\n`,
      );
      await pool.query(
        `
        UPDATE scan_reports
        SET status = 'failed',
            engine_warnings = array_append(engine_warnings, $1),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
        [userFacingHint, reportId],
      );
    }
  },

  async getReportsHistory(
    adminId: string,
    page: number = 1,
    limit: number = 10,
    type: string = "all",
    timeframe: string = "all",
  ) {
    process.stdout.write(
      `[GEMINI_HISTORY] Fetching scan index for user ID: ${adminId} | Page: ${page} | Type: ${type} | Time: ${timeframe}\n`,
    );

    const offset = (page - 1) * limit;
    let whereClause = `WHERE scanned_by = $1 AND ai_provider = 'gemini'`;
    const values: any[] = [adminId];
    let paramIndex = 2;

    if (type === "url" || type === "repo") {
      whereClause += ` AND scan_type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

    if (timeframe === "1d") {
      whereClause += ` AND created_at >= NOW() - INTERVAL '1 day'`;
    } else if (timeframe === "3d") {
      whereClause += ` AND created_at >= NOW() - INTERVAL '3 days'`;
    } else if (timeframe === "1w") {
      whereClause += ` AND created_at >= NOW() - INTERVAL '1 week'`;
    } else if (timeframe === "1m") {
      whereClause += ` AND created_at >= NOW() - INTERVAL '1 month'`;
    } else if (timeframe === "2m") {
      whereClause += ` AND created_at >= NOW() - INTERVAL '2 months'`;
    }

    const countSql = `SELECT COUNT(*) FROM scan_reports ${whereClause};`;
    const dataSql = `
      SELECT * FROM scan_reports 
      ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const countValues = [...values];
    values.push(limit, offset);

    const countResult = await pool.query(countSql, countValues);
    const totalItems = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalItems / limit) || 1;

    const result = await pool.query(dataSql, values);

    return {
      data: result.rows,
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        limit,
      },
    };
  },

  async getSingleReportData(
    reportId: string,
    adminId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    process.stdout.write(
      `[GEMINI_REPORT] Fetching isolated details for Report ID: ${reportId} | Page: ${page}\n`,
    );

    const offset = (page - 1) * limit;

    const reportSql = `SELECT * FROM scan_reports WHERE id = $1 AND scanned_by = $2 AND ai_provider = 'gemini';`;
    const reportRes = await pool.query(reportSql, [reportId, adminId]);

    if (reportRes.rows.length === 0) {
      return { report: null, findings: [], meta: null };
    }

    const countFindingsSql = `SELECT COUNT(*) FROM scan_findings WHERE report_id = $1;`;
    const countRes = await pool.query(countFindingsSql, [reportId]);
    const totalItems = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(totalItems / limit) || 1;

    const findingsSql = `
      SELECT 
        id, 
        report_id, 
        file_path, 
        vulnerability_name, 
        severity AS level, 
        code_snippet, 
        ai_explanation AS explanation, 
        how_to_trigger, 
        ai_fix_suggestion AS how_to_fix, 
        created_at
      FROM scan_findings 
      WHERE report_id = $1 
      ORDER BY CASE severity 
        WHEN 'Critical' THEN 1 
        WHEN 'High' THEN 2 
        WHEN 'Medium' THEN 3 
        WHEN 'Low' THEN 4 
        ELSE 5 
      END
      LIMIT $2 OFFSET $3;
    `;

    const findingsRes = await pool.query(findingsSql, [
      reportId,
      limit,
      offset,
    ]);

    return {
      report: reportRes.rows[0],
      findings: findingsRes.rows,
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        limit,
      },
    };
  },
};
