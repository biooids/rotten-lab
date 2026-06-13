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

// MODIFIED: Changed top-level validation to act as a warning instead of a fatal exit.
// We preserve the global environment key for Admins/Super Admins to use by default.
const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"];

if (!ANTHROPIC_API_KEY) {
  process.stderr.write(
    "[WARNING] ANTHROPIC_API_KEY environment variable is not assigned. Default admin scans will fail unless a BYOK key is provided.\n",
  );
}

// MODIFIED: Instantiate the global client safely (only if the environment variable exists).
const globalAnthropicClient = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

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

    // --- ADDED: BYOK & FALLBACK KEY RESOLUTION LOGIC ---
    let activeAnthropicClient: Anthropic;
    try {
      const encryptionKey = process.env["DB_ENCRYPTION_KEY"] as string;

      // MODIFIED: Updated SQL to manually select allow_global_claude from system_settings directly in this query
      const userKeySql = `
        SELECT 
          u.role,
          CASE 
            WHEN u.claude_api_key IS NOT NULL AND u.claude_api_key <> '' 
            THEN pgp_sym_decrypt(dearmor(u.claude_api_key), $2) 
            ELSE NULL 
          END AS decrypted_key,
          (SELECT allow_global_claude FROM system_settings WHERE id = 1) AS allow_global_claude
        FROM users u
        WHERE u.id = $1;
      `;
      const keyRes = await pool.query(userKeySql, [adminId, encryptionKey]);

      if (keyRes.rows.length === 0) {
        throw new Error(
          `User with ID ${adminId} not found during API key resolution.`,
        );
      }

      const userRow = keyRes.rows[0];

      if (userRow.decrypted_key) {
        // STANDARD USER (OR ADMIN OVERRIDE): Instantiate a dynamic client using their personal key
        activeAnthropicClient = new Anthropic({
          apiKey: userRow.decrypted_key,
        });
        process.stdout.write(
          `[CLAUDE_AUTH] Spawning dynamic AI client using custom BYOK for user ${adminId}.\n`,
        );
      } else if (userRow.role === "admin" || userRow.role === "super_admin") {
        // ADMIN: Use the global .env client for easy access
        if (!globalAnthropicClient) {
          throw new Error(
            "Admin user lacks custom key, and server is missing default ANTHROPIC_API_KEY in environment variables.",
          );
        }
        activeAnthropicClient = globalAnthropicClient;
        process.stdout.write(
          `[CLAUDE_AUTH] Routing to global environment AI client for admin ${adminId}.\n`,
        );
      } else if (userRow.allow_global_claude === true) {
        // ADDED: STANDARD USER FALLBACK TO GLOBAL KEY IF PERMITTED BY SYSTEM SETTINGS
        if (!globalAnthropicClient) {
          throw new Error(
            "System setting allows global Claude, but ANTHROPIC_API_KEY is missing from environment variables.",
          );
        }
        activeAnthropicClient = globalAnthropicClient;
        process.stdout.write(
          `[CLAUDE_AUTH] Routing to global environment AI client for standard user ${adminId} via system_settings permission.\n`,
        );
      } else {
        throw new Error(
          "Access Denied: Standard users must provide their own Claude API key in Account Settings, and global access is currently disabled.",
        );
      }
    } catch (keyErr: any) {
      process.stderr.write(
        `[CLAUDE_AUTH_FATAL] Failed to resolve API key for user ${adminId}: ${keyErr?.message || keyErr}\nStack: ${keyErr?.stack || "no stack"}\n`,
      );
      process.stderr.write(
        `[RAW_ERROR_DUMP] ${JSON.stringify(keyErr, Object.getOwnPropertyNames(keyErr), 2)}\n`,
      );

      await pool.query(
        `UPDATE scan_reports SET status = 'failed', engine_warnings = array_append(engine_warnings, $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [
          `API Key Resolution Failed: ${keyErr?.message || "Unknown error"}`,
          reportId,
        ],
      );
      return;
    }
    // --- END BYOK LOGIC ---

    const CHUNK_SIZE = 4;
    const totalChunks = Math.ceil(rawFindings.length / CHUNK_SIZE);

    // --- CRASH RECOVERY / RESUMPTION LOGIC ---
    const stateRes = await pool.query(
      `SELECT completed_chunks FROM scan_reports WHERE id = $1`,
      [reportId],
    );
    const alreadyCompletedChunks = stateRes.rows[0]?.completed_chunks || 0;
    const startingIndex = alreadyCompletedChunks * CHUNK_SIZE;

    process.stdout.write(
      `[CLAUDE_BULK_START] Commencing chunked AI processing. Total Findings: ${rawFindings.length} | Total Chunks: ${totalChunks} | Resuming from Chunk: ${alreadyCompletedChunks + 1}\n`,
    );

    let contextualSystemBaseInstruction = `You are a Senior Application Security Engineer. You will receive a JSON array of raw code vulnerabilities. You must analyze each one and return a strictly formatted JSON array containing the exact remediation steps for each item, mapped by its 'reference_id'. Do not miss any items. You MUST return ONLY valid JSON, starting with [ and ending with ], with no markdown blocks or surrounding text.`;

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
        `\n[CLAUDE_CHUNK_${chunkNumber}] Transmitting findings ${chunkStart + 1} to ${Math.min(chunkStart + CHUNK_SIZE, rawFindings.length)} to ${model}...\n`,
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
      let aiResultsArray: BulkClaudeFindingResponse[] | null = null;
      let totalTokens = 0,
        promptTokens = 0,
        completionTokens = 0;

      while (attempt <= MAX_RETRIES) {
        try {
          // MODIFIED: Replaced global 'anthropic' with dynamic 'activeAnthropicClient'
          const response = await activeAnthropicClient.messages.create({
            model,
            max_tokens: 8192,
            system: contextualSystemBaseInstruction,
            messages: [{ role: "user", content: runtimePrompt }],
          });

          promptTokens = response.usage.input_tokens;
          completionTokens = response.usage.output_tokens;
          totalTokens = promptTokens + completionTokens;

          const textBlock = response.content.find(
            (block) => block.type === "text",
          );
          if (!textBlock || !("text" in textBlock)) {
            throw new Error("AI returned an empty or invalid response string.");
          }

          let cleanJsonText = textBlock.text.trim();
          if (cleanJsonText.startsWith("```json")) {
            cleanJsonText = cleanJsonText
              .replace(/^```json/, "")
              .replace(/```$/, "")
              .trim();
          }

          // JSON Parsing Guard
          try {
            aiResultsArray = JSON.parse(
              cleanJsonText,
            ) as BulkClaudeFindingResponse[];
            break; // SUCCESS! Break out of the retry while-loop.
          } catch (parseErr: any) {
            process.stderr.write(
              `[CLAUDE_PARSE_FAIL] Invalid JSON returned. Attempting retry...\n`,
            );
            throw new Error(`Invalid JSON format: ${parseErr.message}`);
          }
        } catch (aiErr: any) {
          attempt++;
          const httpStatus = aiErr?.status ?? aiErr?.response?.status ?? null;
          const errorType =
            aiErr?.error?.type ?? aiErr?.error?.error?.type ?? null;
          const errMsgLower = String(aiErr?.message || "").toLowerCase();

          // Define what is retryable for Anthropic
          const isRateLimit =
            httpStatus === 429 || errorType === "rate_limit_error";
          const isOverloaded =
            httpStatus === 529 || errorType === "overloaded_error";
          const isServerError =
            (typeof httpStatus === "number" && httpStatus >= 500) ||
            errorType === "api_error";
          const isNetworkError = [
            "ECONNREFUSED",
            "ENOTFOUND",
            "ETIMEDOUT",
            "AbortError",
          ].includes(aiErr?.code || aiErr?.name);
          const isJsonParseError = errMsgLower.includes("invalid json");

          if (
            (isRateLimit ||
              isOverloaded ||
              isServerError ||
              isNetworkError ||
              isJsonParseError) &&
            attempt <= MAX_RETRIES
          ) {
            // Exponential backoff: 15s, 30s, 60s, 120s, 240s
            const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            process.stdout.write(
              `[CLAUDE_RETRY_WARNING] Chunk ${chunkNumber} failed (${isRateLimit ? "429 Rate Limit" : "Error"}). Retrying in ${backoffMs / 1000}s... (Attempt ${attempt}/${MAX_RETRIES})\n`,
            );
            await setTimeout(backoffMs);
            continue; // Spin the while loop again
          }

          // If we hit MAX_RETRIES or it's a fatal non-retryable error (e.g. 401 Auth, 403 Forbidden)
          process.stderr.write(
            `[CLAUDE_CHUNK_FATAL] reportId=${reportId} chunk=${chunkNumber} status=${httpStatus} type=${errorType} | ${aiErr?.message || "no message"}\n`,
          );
          process.stderr.write(
            `[RAW_ERROR_DUMP] ${JSON.stringify(aiErr, Object.getOwnPropertyNames(aiErr), 2)}\n`,
          );

          await pool.query(
            `UPDATE scan_reports SET status = 'failed', engine_warnings = array_append(engine_warnings, $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [
              `Claude Engine Fatal Error after ${attempt} attempts: ${aiErr?.message?.substring(0, 200)}`,
              reportId,
            ],
          );

          return; // Kill the entire background worker
        }
      } // End of Retry While-Loop

      process.stdout.write(
        `[CLAUDE_CHUNK_${chunkNumber}_SUCCESS] Cost: ${totalTokens} tokens. Writing ${aiResultsArray!.length} findings to DB...\n`,
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
          `[CLAUDE_RATE_LIMIT] Chunk ${chunkNumber} complete. Sleeping 61s for token refresh...\n`,
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

  async testConnection(adminId: string): Promise<any> {
    process.stdout.write(
      `\n[CLAUDE_TEST] Initiating connection test for user ID: ${adminId}\n`,
    );
    const startTime = Date.now();
    let activeAnthropicClient: Anthropic;
    let source = "UNKNOWN";

    try {
      // 1. Test Database & Decryption
      const encryptionKey = process.env["DB_ENCRYPTION_KEY"] as string;

      // MODIFIED: Added system_settings select to check allow_global_claude manually
      const userKeySql = `
        SELECT u.role,
        CASE 
          WHEN u.claude_api_key IS NOT NULL AND u.claude_api_key <> '' 
          THEN pgp_sym_decrypt(dearmor(u.claude_api_key), $2) 
          ELSE NULL 
        END AS decrypted_key,
        (SELECT allow_global_claude FROM system_settings WHERE id = 1) AS allow_global_claude
        FROM users u WHERE u.id = $1;
      `;
      const keyRes = await pool.query(userKeySql, [adminId, encryptionKey]);

      if (keyRes.rows.length === 0) {
        throw new Error("USER_NOT_FOUND: User does not exist in the database.");
      }

      const userRow = keyRes.rows[0];

      // 2. Resolve the Key
      if (userRow.decrypted_key) {
        activeAnthropicClient = new Anthropic({
          apiKey: userRow.decrypted_key,
        });
        source = "PERSONAL_BYOK";
        process.stdout.write(
          `[CLAUDE_TEST] Successfully decrypted BYOK for user.\n`,
        );
      } else if (userRow.role === "admin" || userRow.role === "super_admin") {
        if (!globalAnthropicClient) {
          throw new Error(
            "SYSTEM_KEY_MISSING: Admin lacks BYOK and server lacks .env key.",
          );
        }
        activeAnthropicClient = globalAnthropicClient;
        source = "SYSTEM_DEFAULT";
        process.stdout.write(
          `[CLAUDE_TEST] Using system default .env key for Admin.\n`,
        );
      } else if (userRow.allow_global_claude === true) {
        // ADDED: Global fallback for standard users based on admin permission
        if (!globalAnthropicClient) {
          throw new Error(
            "SYSTEM_KEY_MISSING: System allows global Claude, but server lacks .env key.",
          );
        }
        activeAnthropicClient = globalAnthropicClient;
        source = "SYSTEM_DEFAULT_GRANTED";
        process.stdout.write(
          `[CLAUDE_TEST] Using system default .env key for standard user via granted permission.\n`,
        );
      } else {
        throw new Error(
          "MISSING_BYOK: Standard user has no configured API key, and global access is disabled.",
        );
      }

      // 3. Ping the AI Model (UPDATED)
      process.stdout.write(
        `[CLAUDE_TEST] Dispatching telemetry ping to Claude API...\n`,
      );

      const prompt =
        "Please respond with a very short, friendly 5-word greeting to confirm our connection is active.";

      const response = await activeAnthropicClient.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 50, // Keep it low so it's cheap/fast
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      const text = textBlock && "text" in textBlock ? textBlock.text : "";

      if (!text.trim()) {
        throw new Error(`EMPTY_AI_RESPONSE: The AI returned a blank message.`);
      }

      const latencyMs = Date.now() - startTime;
      process.stdout.write(
        `[CLAUDE_TEST_SUCCESS] Connection verified in ${latencyMs}ms using ${source}. Response: "${text.trim()}"\n`,
      );

      // We now pass the EXACT AI response back to the frontend
      return {
        success: true,
        message: "Claude AI connection established successfully.",
        aiResponse: text.trim(),
        latencyMs,
        source,
      };
    } catch (err: any) {
      process.stderr.write(
        `[CLAUDE_TEST_FATAL] Telemetry failed: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },
};
