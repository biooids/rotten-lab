//src/features/ai/gemini/gemini.service.ts
import { GoogleGenAI, Type } from "@google/genai";
import { setTimeout } from "node:timers/promises";
import { pool } from "../../../db/psql.js";
import { gitScannerService } from "../../ai/core-scanners/gitScanner.service.js";
import { webScannerService } from "../../ai/core-scanners/webScanner.service.js";
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

    // MANUALLY ADDED: total_chunks and completed_chunks defaults
    const masterSql = `
      INSERT INTO scan_reports (target_url, scan_type, ai_provider, ai_model, scanned_by, status, engine_warnings, total_chunks, completed_chunks)
      VALUES ($1, $2, 'gemini', $3, $4, 'pending', '{}', 0, 0)
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

      // MANUALLY ADDED: Calculate total chunks and save to DB before hitting the AI loop
      const calculatedTotalChunks = Math.ceil(rawVulnerabilities.length / 4);
      await pool.query(
        `UPDATE scan_reports SET status = 'processing', total_chunks = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [calculatedTotalChunks, reportId],
      );

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
      // EXPLICIT ERROR DUMP
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
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

      // MANUALLY ADDED: Calculate total chunks and save to DB before hitting the AI loop
      const calculatedTotalChunks = Math.ceil(rawVulnerabilities.length / 4);
      await pool.query(
        `UPDATE scan_reports SET status = 'processing', total_chunks = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [calculatedTotalChunks, reportId],
      );

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
      // EXPLICIT ERROR DUMP
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
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

    const CHUNK_SIZE = 4;
    const totalChunks = Math.ceil(rawFindings.length / CHUNK_SIZE);

    // --- CRASH RECOVERY / RESUMPTION LOGIC ---
    // If the server crashed and Redis/Queue re-triggers this job, we check the DB
    // to see how many chunks were already completed successfully to avoid double-billing.
    const stateRes = await pool.query(
      `SELECT completed_chunks FROM scan_reports WHERE id = $1`,
      [reportId],
    );
    const alreadyCompletedChunks = stateRes.rows[0]?.completed_chunks || 0;
    const startingIndex = alreadyCompletedChunks * CHUNK_SIZE;

    process.stdout.write(
      `[GEMINI_BULK_START] Commencing chunked AI processing. Total Findings: ${rawFindings.length} | Total Chunks: ${totalChunks} | Resuming from Chunk: ${alreadyCompletedChunks + 1}\n`,
    );

    let contextualSystemBaseInstruction = `You are a Senior Application Security Engineer. You will receive a JSON array of raw code vulnerabilities. You must analyze each one and return a strictly formatted JSON array containing the exact remediation steps for each item, mapped by its 'reference_id'. Do not miss any items. You MUST return ONLY valid JSON, starting with [ and ending with ], with no markdown blocks, no prose preamble, and no commentary outside the JSON array.`;

    if (projectContext && projectContext.trim().length > 0) {
      contextualSystemBaseInstruction = `${contextualSystemBaseInstruction}\n\nCRITICAL ARCHITECTURE INFORMATION: The code repository ecosystem relies heavily on the following package environment dependencies context list configuration details: ${projectContext}. You MUST structure all how_to_fix suggestions to cleanly utilize native APIs, patterns, and features belonging strictly to these framework dependency architectures instead of giving generalized vanilla textbook solution guidelines.`;
    }

    // Explicit Iteration Loop - Starts at the resumed index!
    for (
      let chunkStart = startingIndex;
      chunkStart < rawFindings.length;
      chunkStart += CHUNK_SIZE
    ) {
      const chunkNumber = Math.floor(chunkStart / CHUNK_SIZE) + 1;
      const currentChunkFindings = rawFindings.slice(
        chunkStart,
        chunkStart + CHUNK_SIZE,
      );

      process.stdout.write(
        `\n[GEMINI_CHUNK_${chunkNumber}] Transmitting findings ${chunkStart + 1} to ${Math.min(chunkStart + CHUNK_SIZE, rawFindings.length)} to ${model}...\n`,
      );

      const structuredPayload = currentChunkFindings.map(
        (finding, localIndex) => {
          const absoluteIndex = chunkStart + localIndex;
          return {
            reference_id: absoluteIndex,
            file_path: finding.file_path,
            rule: finding.vulnerability_name,
            severity: finding.severity,
            snippet: finding.code_snippet,
          };
        },
      );

      const runtimePrompt = `
        Analyze this array of flagged vulnerabilities:
        ${JSON.stringify(structuredPayload, null, 2)}
        
        Return a JSON array of objects. Each object must contain:
        - reference_id: The exact integer from the input.
        - explanation: Technical root cause analysis.
        - how_to_trigger: How an attacker would exploit this.
        - how_to_fix: Concrete code/configuration remediation.
      `;

      // --- THE EXPONENTIAL BACKOFF RETRY BLOCK ---
      let attempt = 0;
      const MAX_RETRIES = 5;
      const BASE_DELAY_MS = 15000; // 15 seconds
      let aiResultsArray: BulkGeminiFindingResponse[] | null = null;
      let totalTokens = 0,
        promptTokens = 0,
        completionTokens = 0;

      while (attempt <= MAX_RETRIES) {
        try {
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
          promptTokens = usage?.promptTokenCount ?? 0;
          completionTokens = usage?.candidatesTokenCount ?? 0;
          totalTokens = usage?.totalTokenCount ?? 0;

          if (!response.text)
            throw new Error("AI returned empty response string.");

          // JSON Parsing Guard
          try {
            aiResultsArray = JSON.parse(
              response.text,
            ) as BulkGeminiFindingResponse[];
            break; // SUCCESS! Break out of the retry while-loop.
          } catch (parseErr: any) {
            process.stderr.write(
              `[GEMINI_PARSE_FAIL] Invalid JSON returned. Attempting retry...\n`,
            );
            throw new Error(`Invalid JSON format: ${parseErr.message}`);
          }
        } catch (aiErr: any) {
          attempt++;
          const httpStatus = aiErr?.status ?? aiErr?.response?.status ?? null;
          const googleStatus = aiErr?.error?.status ?? aiErr?.code ?? null;
          const errMsgLower = String(aiErr?.message || "").toLowerCase();

          // Define what is retryable (Rate limits, Server Errors, Network drops)
          const isRateLimit =
            httpStatus === 429 ||
            googleStatus === "RESOURCE_EXHAUSTED" ||
            errMsgLower.includes("quota");
          const isServerError =
            (typeof httpStatus === "number" && httpStatus >= 500) ||
            errMsgLower.includes("5xx") ||
            googleStatus === "UNAVAILABLE";
          const isNetworkError = [
            "ECONNREFUSED",
            "ENOTFOUND",
            "ETIMEDOUT",
            "AbortError",
          ].includes(aiErr?.code || aiErr?.name);
          const isJsonParseError = errMsgLower.includes("invalid json");

          if (
            (isRateLimit ||
              isServerError ||
              isNetworkError ||
              isJsonParseError) &&
            attempt <= MAX_RETRIES
          ) {
            // Exponential backoff: 15s, 30s, 60s, 120s, 240s
            const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            process.stdout.write(
              `[GEMINI_RETRY_WARNING] Chunk ${chunkNumber} failed (${isRateLimit ? "429 Rate Limit" : "Error"}). Retrying in ${backoffMs / 1000}s... (Attempt ${attempt}/${MAX_RETRIES})\n`,
            );
            await setTimeout(backoffMs);
            continue; // Spin the while loop again
          }

          // If we hit MAX_RETRIES or it's a fatal non-retryable error (e.g. 401 Auth, 403 Forbidden)
          process.stderr.write(
            `[GEMINI_CHUNK_FATAL] reportId=${reportId} chunk=${chunkNumber} status=${httpStatus} | ${aiErr?.message || "no message"}\n`,
          );
          process.stderr.write(
            `[RAW_ERROR_DUMP] ${JSON.stringify(aiErr, Object.getOwnPropertyNames(aiErr), 2)}\n`,
          );

          await pool.query(
            `UPDATE scan_reports SET status = 'failed', engine_warnings = array_append(engine_warnings, $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [
              `Gemini Engine Fatal Error after ${attempt} attempts: ${aiErr?.message?.substring(0, 200)}`,
              reportId,
            ],
          );

          return; // Kill the entire background worker
        }
      } // End of Retry While-Loop

      // If we got here, aiResultsArray is guaranteed to be valid and populated
      process.stdout.write(
        `[GEMINI_CHUNK_${chunkNumber}_SUCCESS] Cost: ${totalTokens} tokens. Writing ${aiResultsArray!.length} findings to DB...\n`,
      );

      await pool.query(
        `INSERT INTO ai_token_logs (admin_id, model_used, prompt_tokens, completion_tokens, total_tokens, action_type) VALUES ($1, $2, $3, $4, $5, $6);`,
        [
          adminId,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          scanType === "url" ? "URL_SCAN" : "REPO_SCAN",
        ],
      );

      const returnedReferenceIds = new Set<number>();
      for (const aiResult of aiResultsArray!) {
        const originalRawFinding = rawFindings[aiResult.reference_id];
        if (!originalRawFinding) continue;

        returnedReferenceIds.add(aiResult.reference_id);
        await pool.query(
          `INSERT INTO scan_findings (report_id, file_path, vulnerability_name, severity, code_snippet, ai_explanation, how_to_trigger, ai_fix_suggestion) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
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

      // MANUALLY ADDED: Increment completed_chunks in DB directly after the write finishes
      await pool.query(
        `UPDATE scan_reports SET completed_chunks = completed_chunks + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [reportId],
      );

      // Standard Rate Limit Sleep (If not the last chunk)
      if (chunkNumber < totalChunks) {
        process.stdout.write(
          `[GEMINI_RATE_LIMIT] Chunk ${chunkNumber} complete. Sleeping 61s for token refresh...\n`,
        );
        await setTimeout(61000);
      }
    } // End of Manual Loop

    process.stdout.write(
      `[BACKGROUND_WORKER_SUCCESS] Scan ID ${reportId} processed all chunks successfully in ${Date.now() - aiStartTime}ms.\n`,
    );
    await pool.query(
      `UPDATE scan_reports SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [reportId],
    );
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
