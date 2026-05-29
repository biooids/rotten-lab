//src/features/ai/claude/claude.service.ts
import Anthropic from "@anthropic-ai/sdk";
import { setTimeout } from "node:timers/promises";
import { pool } from "../../../db/psql.js";
import { gitScannerService } from "../../ai/core-scanners/gitScanner.service.js";
import { webScannerService } from "../../ai/core-scanners/webScanner.service.js";
import type {
  ClaudeModelId,
  DatabaseScanReport,
  BulkClaudeFindingResponse,
} from "./claude.types.js";

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"];

if (!ANTHROPIC_API_KEY) {
  process.stderr.write(
    "FATAL RUNTIME CONFIG ERROR: ANTHROPIC_API_KEY variable context layer unassigned.\n",
  );
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const claudeService = {
  async initializeReport(
    targetUrl: string,
    scanType: "url" | "repo",
    adminId: string,
    model: ClaudeModelId,
  ): Promise<DatabaseScanReport> {
    process.stdout.write(
      `[CLAUDE_DB_INIT] Committing new parent report row with status PENDING for target: ${targetUrl} (model=${model})\n`,
    );

    // MANUALLY ADDED: total_chunks and completed_chunks defaults
    const masterSql = `
      INSERT INTO scan_reports (target_url, scan_type, ai_provider, ai_model, scanned_by, status, engine_warnings, total_chunks, completed_chunks)
      VALUES ($1, $2, 'claude', $3, $4, 'pending', '{}', 0, 0)
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
      `[CLAUDE_DB_SUCCESS] Report generated. UUID: ${report.id}\n`,
    );
    return report;
  },

  async runBackgroundUrlScan(
    reportId: string,
    targetUrl: string,
    adminId: string,
    model: ClaudeModelId,
  ): Promise<void> {
    try {
      process.stdout.write(
        `[BACKGROUND_WORKER] Starting URL background execution for Report ID: ${reportId} (provider=claude model=${model})\n`,
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

      await this.processBulkClaudeCall(
        reportId,
        rawVulnerabilities,
        "url",
        adminId,
        model,
      );
    } catch (err: any) {
      process.stderr.write(
        `[BACKGROUND_CRASH_URL] Background worker failed | reportId=${reportId} adminId=${adminId} provider=claude model=${model} | ${err?.constructor?.name || "Error"}: ${err?.message || err}\nStack: ${err?.stack || "no stack"}\n`,
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
    model: ClaudeModelId,
  ): Promise<void> {
    try {
      process.stdout.write(
        `[BACKGROUND_WORKER] Starting Git background execution loop matching Semgrep and Framework Analysis for Report ID: ${reportId} (provider=claude model=${model})\n`,
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

      await this.processBulkClaudeCall(
        reportId,
        rawVulnerabilities,
        "repo",
        adminId,
        model,
        extractedProjectDependenciesContext,
      );
    } catch (err: any) {
      process.stderr.write(
        `[BACKGROUND_CRASH_REPO] Git worker failed | reportId=${reportId} adminId=${adminId} provider=claude model=${model} | ${err?.constructor?.name || "Error"}: ${err?.message || err}\nStack: ${err?.stack || "no stack"}\n`,
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

  async processBulkClaudeCall(
    reportId: string,
    rawFindings: Array<{
      file_path: string;
      vulnerability_name: string;
      severity: string;
      code_snippet: string;
    }>,
    scanType: "url" | "repo",
    adminId: string,
    model: ClaudeModelId,
    projectContext?: string,
  ): Promise<void> {
    const aiStartTime = Date.now();

    // Explicit manual chunk variables
    const CHUNK_SIZE = 4;
    const totalChunks = Math.ceil(rawFindings.length / CHUNK_SIZE);

    process.stdout.write(
      `[CLAUDE_BULK_START] Commencing chunked AI processing loop. Total Findings: ${rawFindings.length} | Total Chunks: ${totalChunks}\n`,
    );

    let contextualSystemBaseInstruction = `You are a Senior Application Security Engineer. You will receive a JSON array of raw code vulnerabilities. You must analyze each one and return a strictly formatted JSON array containing the exact remediation steps for each item, mapped by its 'reference_id'. Do not miss any items. You MUST return ONLY valid JSON, starting with [ and ending with ], with no markdown blocks or surrounding text.`;

    if (projectContext && projectContext.trim().length > 0) {
      contextualSystemBaseInstruction = `${contextualSystemBaseInstruction}\n\nCRITICAL ARCHITECTURE INFORMATION: The code repository ecosystem relies heavily on the following package environment dependencies context list configuration details: ${projectContext}. You MUST structure all how_to_fix suggestions to cleanly utilize native APIs, patterns, and features belonging strictly to these framework dependency architectures instead of giving generalized vanilla textbook solution guidelines.`;
    }

    // MANUALLY ADDED: The Explicit Iteration Loop
    for (
      let chunkStart = 0;
      chunkStart < rawFindings.length;
      chunkStart += CHUNK_SIZE
    ) {
      const chunkNumber = Math.floor(chunkStart / CHUNK_SIZE) + 1;
      const currentChunkFindings = rawFindings.slice(
        chunkStart,
        chunkStart + CHUNK_SIZE,
      );

      process.stdout.write(
        `\n[CLAUDE_CHUNK_${chunkNumber}] Transmitting findings ${chunkStart + 1} to ${Math.min(chunkStart + CHUNK_SIZE, rawFindings.length)} to ${model}...\n`,
      );

      // Map payload strictly for this specific chunk, but preserve absolute reference_id mapping
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

      try {
        const response = await anthropic.messages.create({
          model,
          max_tokens: 8192,
          system: contextualSystemBaseInstruction,
          messages: [{ role: "user", content: runtimePrompt }],
        });

        const promptTokens = response.usage.input_tokens;
        const completionTokens = response.usage.output_tokens;
        const totalTokens = promptTokens + completionTokens;

        process.stdout.write(
          `[CLAUDE_CHUNK_${chunkNumber}_SUCCESS] Cost: ${totalTokens} tokens. Saving chunk token metrics...\n`,
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

        const textBlock = response.content.find(
          (block) => block.type === "text",
        );
        if (!textBlock || !("text" in textBlock)) {
          throw new Error(
            "AI completed but returned an empty or invalid response string.",
          );
        }

        let cleanJsonText = textBlock.text.trim();
        if (cleanJsonText.startsWith("```json")) {
          cleanJsonText = cleanJsonText
            .replace(/^```json/, "")
            .replace(/```$/, "")
            .trim();
        }

        let aiResultsArray: BulkClaudeFindingResponse[];
        try {
          aiResultsArray = JSON.parse(
            cleanJsonText,
          ) as BulkClaudeFindingResponse[];
        } catch (parseErr: any) {
          process.stderr.write(
            `[CLAUDE_RESPONSE_PARSE_FAIL] reportId=${reportId} provider=claude model=${model} | ${parseErr?.constructor?.name || "SyntaxError"}: ${parseErr?.message}\n` +
              `[CLAUDE_RESPONSE_PARSE_FAIL] First 500 chars of returned text: ${cleanJsonText.substring(0, 500)}\n`,
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
              `Claude chunk ${chunkNumber} returned a response that wasn't valid JSON. This is intermittent — please retry the scan. (parser said: ${parseErr?.message?.substring(0, 200)})`,
              reportId,
            ],
          );
          // Stop execution entirely if a chunk fundamentally breaks
          return;
        }

        process.stdout.write(
          `[CLAUDE_DB_WRITE] Writing ${aiResultsArray.length} findings from Chunk ${chunkNumber} to DB...\n`,
        );

        const returnedReferenceIds = new Set<number>();
        for (const aiResult of aiResultsArray) {
          const originalRawFinding = rawFindings[aiResult.reference_id];
          if (!originalRawFinding) {
            process.stderr.write(
              `[CLAUDE_REF_ID_INVALID] reportId=${reportId} reference_id=${aiResult.reference_id} not present in input findings. Skipping.\n`,
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

        // Detect dropped findings for this specific chunk
        const droppedFindings: string[] = [];
        for (
          let i = chunkStart;
          i < chunkStart + currentChunkFindings.length;
          i++
        ) {
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
          process.stdout.write(
            `[CLAUDE_FINDINGS_DROPPED] Chunk ${chunkNumber} dropped ${droppedFindings.length} items: ${droppedFindings.join("; ").substring(0, 400)}\n`,
          );
          await pool.query(
            `
            UPDATE scan_reports
            SET engine_warnings = array_append(engine_warnings, $1),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `,
            [
              `Chunk ${chunkNumber} dropped ${droppedFindings.length} item(s) without analysis: ${droppedFindings.slice(0, 5).join("; ")}${droppedFindings.length > 5 ? "; ..." : ""}`,
              reportId,
            ],
          );
        }

        // MANUALLY ADDED: Increment completed_chunks in DB directly after the write finishes
        await pool.query(
          `UPDATE scan_reports SET completed_chunks = completed_chunks + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [reportId],
        );

        // MANUALLY ADDED: The 60 second Rate Limit Sleep (If not the last chunk)
        if (chunkNumber < totalChunks) {
          process.stdout.write(
            `[CLAUDE_RATE_LIMIT] Chunk ${chunkNumber} of ${totalChunks} complete. Sleeping thread for 61 seconds to refresh Free Tier token bucket...\n`,
          );
          await setTimeout(61000);
        }
      } catch (aiErr: any) {
        const httpStatus = aiErr?.status ?? aiErr?.response?.status ?? null;
        const errorType =
          aiErr?.error?.type ?? aiErr?.error?.error?.type ?? null;
        const isSdkApiError =
          aiErr?.constructor?.name === "APIError" ||
          (aiErr?.constructor?.name?.endsWith("Error") &&
            typeof httpStatus === "number");

        let category = "UNKNOWN";
        let userFacingHint = `Unexpected failure during Claude chunk processing: ${aiErr?.message || "no message"}`;

        if (httpStatus === 401 || errorType === "authentication_error") {
          category = "AUTH_FAILED";
          userFacingHint =
            "Claude API key is invalid or revoked. The server administrator needs to rotate ANTHROPIC_API_KEY.";
        } else if (httpStatus === 403 || errorType === "permission_error") {
          category = "PERMISSION_DENIED";
          userFacingHint = `Your Anthropic account doesn't have access to the model "${model}". Try a different model (e.g. Sonnet 4.6), or upgrade your plan.`;
        } else if (httpStatus === 404 || errorType === "not_found_error") {
          category = "MODEL_NOT_FOUND";
          userFacingHint = `Anthropic doesn't recognize the model "${model}". Pick a different model from the picker — the server config may be out of date.`;
        } else if (httpStatus === 429 || errorType === "rate_limit_error") {
          category = "RATE_LIMITED";
          userFacingHint =
            "Claude is currently rate-limiting requests on this API key. Wait ~60 seconds and retry, or switch to a smaller model (Haiku) for now.";
        } else if (
          httpStatus === 400 ||
          errorType === "invalid_request_error"
        ) {
          category = "BAD_REQUEST";
          userFacingHint = `Anthropic rejected the request as malformed: ${aiErr?.message?.substring(0, 200) || "no detail"}. This is usually a server bug — please report it.`;
        } else if (httpStatus === 529 || errorType === "overloaded_error") {
          category = "OVERLOADED";
          userFacingHint =
            "Claude is overloaded right now (529). This is on Anthropic's end — wait a minute and retry.";
        } else if (
          (typeof httpStatus === "number" && httpStatus >= 500) ||
          errorType === "api_error"
        ) {
          category = "PROVIDER_5XX";
          userFacingHint =
            "Anthropic's API returned a 5xx server error. Not your fault — retry in a minute.";
        } else if (
          aiErr?.code === "ECONNREFUSED" ||
          aiErr?.code === "ENOTFOUND" ||
          aiErr?.code === "ETIMEDOUT" ||
          aiErr?.name === "AbortError"
        ) {
          category = "NETWORK";
          userFacingHint =
            "Couldn't reach Anthropic's API (network error). Check the server's internet connection and retry.";
        }

        process.stderr.write(
          `[CLAUDE_CHUNK_CRASH] reportId=${reportId} chunk=${chunkNumber} category=${category} status=${httpStatus} type=${errorType} sdkClass=${aiErr?.constructor?.name || "n/a"} isSdkApiError=${isSdkApiError} | ${aiErr?.message || "no message"}\nStack: ${aiErr?.stack || "no stack"}\n`,
        );
        // EXPLICIT ERROR DUMP
        process.stderr.write(
          `[RAW_ERROR_DUMP] ${JSON.stringify(aiErr, Object.getOwnPropertyNames(aiErr), 2)}\n`,
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

        // Break the loop entirely to stop processing remaining chunks
        return;
      }
    } // End of Manual Loop

    // If loop successfully completes entirely, flip main status to completed
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
      `[CLAUDE_HISTORY] Fetching scan index for user ID: ${adminId} | Page: ${page} | Type: ${type} | Time: ${timeframe}\n`,
    );

    const offset = (page - 1) * limit;
    // We isolate history fetches specifically to reports generated by Claude
    let whereClause = `WHERE scanned_by = $1 AND ai_provider = 'claude'`;
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
      `[CLAUDE_REPORT] Fetching isolated details for Report ID: ${reportId} | Page: ${page}\n`,
    );

    const offset = (page - 1) * limit;

    const reportSql = `SELECT * FROM scan_reports WHERE id = $1 AND scanned_by = $2 AND ai_provider = 'claude';`;
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
