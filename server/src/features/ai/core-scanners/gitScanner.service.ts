//src/features/core-scanners/gitScanner.service.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface GitScanFinding {
  file_path: string;
  vulnerability_name: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  code_snippet: string;
}

export interface GitScanResult {
  findings: GitScanFinding[];
  context: string;
}

export const gitScannerService = {
  async runScan(repoUrl: string): Promise<GitScanResult> {
    const findings: GitScanFinding[] = [];
    let discoveredContext =
      "No ecosystem manifest files (package.json, go.mod, requirements.txt) detected.";
    const timestamp = new Date().toISOString();

    process.stdout.write(
      `[GIT_SCAN_START] [${timestamp}] Initializing deep static analysis for repository: ${repoUrl}\n`,
    );

    if (!repoUrl.startsWith("https://")) {
      throw new Error("Security Violation: Only HTTPS git URLs are permitted.");
    }

    const randomId = crypto.randomUUID();
    const tempDirName = `appsec-git-workspace-${randomId}`;
    const workspacePath = path.join(os.tmpdir(), tempDirName);

    // Spool file paths for all three tools
    const semgrepIgnorePath = path.join(workspacePath, ".semgrepignore");
    const semgrepOutputPath = path.join(
      os.tmpdir(),
      `appsec-semgrep-${randomId}.json`,
    );
    const gitleaksOutputPath = path.join(
      os.tmpdir(),
      `appsec-gitleaks-${randomId}.json`,
    );
    const trivyOutputPath = path.join(
      os.tmpdir(),
      `appsec-trivy-${randomId}.json`,
    );

    try {
      // Pre-clone size guard
      try {
        const githubMatch = repoUrl.match(
          /github\.com[/:]([\w.\-]+)\/([\w.\-]+?)(?:\.git)?(?:[/?#]|$)/i,
        );
        if (githubMatch) {
          const ownerName = githubMatch[1];
          const repoName = githubMatch[2];
          process.stdout.write(
            `[GIT_SCAN_SIZE_CHECK] Querying GitHub API for repository size: ${ownerName}/${repoName}\n`,
          );
          const sizeRes = await fetch(
            `https://api.github.com/repos/${ownerName}/${repoName}`,
            {
              headers: { "User-Agent": "ai-rotten-lab-scanner/1.0" },
              signal: AbortSignal.timeout(8000),
            },
          );
          if (sizeRes.ok) {
            const sizeJson: any = await sizeRes.json();
            const sizeKb = Number(sizeJson.size || 0);
            const sizeMb = sizeKb / 1024;
            process.stdout.write(
              `[GIT_SCAN_SIZE_CHECK] Reported repository size: ${sizeMb.toFixed(2)} MB\n`,
            );
            if (sizeKb > 500 * 1024) {
              throw new Error(
                `Repository too large for scan engine: ${sizeMb.toFixed(0)} MB (cap is 500 MB). Try a smaller repo or a sub-path.`,
              );
            }
          } else {
            const rateLimitRemaining = sizeRes.headers.get(
              "x-ratelimit-remaining",
            );
            const rateLimitReset = sizeRes.headers.get("x-ratelimit-reset");
            if (sizeRes.status === 403 && rateLimitRemaining === "0") {
              const resetEpoch = parseInt(rateLimitReset || "0", 10);
              const resetIso = resetEpoch
                ? new Date(resetEpoch * 1000).toISOString()
                : "unknown";
              process.stderr.write(
                `[GITHUB_RATE_LIMITED] Unauthenticated GitHub API exhausted (60/hr cap hit). Resets at ${resetIso}. Size pre-check skipped.\n`,
              );
            } else if (sizeRes.status === 404) {
              process.stderr.write(
                `[GIT_SCAN_SIZE_CHECK] GitHub API 404 — repo not found or is private. Proceeding to clone.\n`,
              );
            } else {
              process.stderr.write(
                `[GIT_SCAN_SIZE_CHECK] GitHub API replied ${sizeRes.status} — proceeding without size guard.\n`,
              );
            }
          }
        }
      } catch (sizeCheckErr: any) {
        if (sizeCheckErr.message?.includes("Repository too large")) {
          throw sizeCheckErr;
        }
        process.stderr.write(
          `[GIT_SCAN_SIZE_CHECK] Size pre-check failed softly: ${sizeCheckErr.message}\n`,
        );
      }

      process.stdout.write(
        `[GIT_SCAN_CLONE] [${new Date().toISOString()}] Cloning repository via secure async child process into ephemeral workspace...\n`,
      );

      try {
        await execFileAsync(
          "git",
          ["clone", "--depth", "1", repoUrl, workspacePath],
          { timeout: 45000 },
        );
      } catch (cloneErr: any) {
        if (cloneErr?.code === "ENOENT") {
          throw new Error("Server is missing the 'git' binary.");
        }
        if (cloneErr?.killed && cloneErr?.signal === "SIGTERM") {
          throw new Error("Repository clone exceeded the 45-second timeout.");
        }
        const stderrText = String(cloneErr?.stderr || "").substring(0, 500);
        if (
          stderrText.includes("Repository not found") ||
          stderrText.includes("not found")
        ) {
          throw new Error(
            "GitHub returned 'Repository not found'. Either the repo doesn't exist or it's private.",
          );
        }
        throw new Error(
          `Repository clone failed: ${cloneErr?.message?.substring(0, 200) || "unknown error"}`,
        );
      }

      process.stdout.write(
        `[GIT_SCAN_CONTEXT] [${new Date().toISOString()}] Sweeping workspace directory for architecture framework manifests...\n`,
      );

      const manifests = [
        { path: "package.json", name: "Node.js" },
        { path: "go.mod", name: "Go language" },
        { path: "pyproject.toml", name: "Python (modern)" },
        { path: "requirements.txt", name: "Python dependencies" },
        { path: "Cargo.toml", name: "Rust" },
        { path: "pom.xml", name: "Java/Maven" },
        { path: "build.gradle", name: "Java/Gradle" },
        { path: "build.gradle.kts", name: "Kotlin/Gradle" },
        { path: "composer.json", name: "PHP" },
        { path: "Gemfile", name: "Ruby" },
      ];

      for (const manifest of manifests) {
        const fullPath = path.join(workspacePath, manifest.path);
        if (fs.existsSync(fullPath)) {
          try {
            const content = fs
              .readFileSync(fullPath, "utf8")
              .substring(0, 8192);
            discoveredContext = `${manifest.name} project detected. ${manifest.path} manifest contents: ${content}`;
            process.stdout.write(
              `[GIT_SCAN_CONTEXT_FOUND] Captured ${manifest.path} metadata successfully.\n`,
            );
            break;
          } catch (e: any) {
            process.stderr.write(
              `[CONTEXT_ERR] Failed reading ${manifest.path}: ${e.message}\n`,
            );
          }
        }
      }

      process.stdout.write(
        `[GIT_SCAN_IGNORE_CONFIG] Generating strict dynamic .semgrepignore file...\n`,
      );

      // UPDATED IGNORE CONFIG: Removed Section 5 (Tests/Coverage) so vulnerabilities in test folders get caught
      const ignoreContent = `
# 1. CRITICAL: Force Semgrep to respect the project's .gitignore
:include .gitignore

# 2. Package Managers & Environments
node_modules/
bower_components/
pnpm-lock.yaml
package-lock.json
yarn.lock
.env
.env.*
venv/
.venv/
python-packages/

# 3. Heavy Build, Framework & Cloud Bundles
.next/
.nuxt/
dist/
build/
out/
.cache/
.terraform/
.serverless/
.docusaurus/

# 4. Git, System, & IDE Noise
.git/
.svn/
.hg/
.vscode/
.idea/
.DS_Store
Thumbs.db

# 5. Compiled, Minified, Data, & Asset Files
*.min.js
*.map
*.bundle.js
*.jpg
*.jpeg
*.png
*.gif
*.svg
*.ico
*.pdf
*.zip
*.tar.gz
*.sqlite
*.db
`;
      fs.writeFileSync(semgrepIgnorePath, ignoreContent);

      process.stdout.write(
        `[GIT_SCAN_EXECUTE] [${new Date().toISOString()}] Invoking Parallel Scanner Engines (Semgrep, Gitleaks, Trivy)...\n`,
      );

      // Execute all 3 CLI tools concurrently. We use allSettled because non-zero exit codes (finding bugs) throw errors in execFileAsync.
      const scanPromises = [
        execFileAsync(
          "semgrep",
          [
            "scan",
            "--json",
            "--quiet",
            "--config=p/owasp-top-ten",
            "--config=p/security-audit",
            "--output",
            semgrepOutputPath,
            workspacePath,
          ],
          { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
        ),
        execFileAsync(
          "gitleaks",
          [
            "detect",
            "--source",
            workspacePath,
            "--report-path",
            gitleaksOutputPath,
            "--no-git",
            "--report-format",
            "json",
          ],
          { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
        ),
        execFileAsync(
          "trivy",
          [
            "fs",
            workspacePath,
            "--format",
            "json",
            "--output",
            trivyOutputPath,
            "--scanners",
            "vuln",
          ],
          { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
        ),
      ];

      await Promise.allSettled(scanPromises);

      process.stdout.write(
        `[GIT_SCAN_PROCESSING] Parsing localized scanner JSON spools...\n`,
      );

      // ==========================================
      // PARSER 1: SEMGREP (SAST - Code Logic)
      // ==========================================
      if (fs.existsSync(semgrepOutputPath)) {
        try {
          const semgrepRaw = fs.readFileSync(semgrepOutputPath, "utf8");
          if (semgrepRaw.trim().length > 0) {
            const semgrepResults = JSON.parse(semgrepRaw).results || [];
            process.stdout.write(
              `[SEMGREP_PARSER] Extracted ${semgrepResults.length} findings.\n`,
            );

            for (const targetFinding of semgrepResults) {
              const rawFilePath = targetFinding.path || "unknown_file";
              const relativePath = rawFilePath.replace(workspacePath + "/", "");
              const ruleIdName =
                targetFinding.check_id || "Generic Ast Violation Rule";
              const targetExtra = targetFinding.extra || {};

              let translatedSeverity: "Low" | "Medium" | "High" | "Critical" =
                "Medium";
              const rawSeverityString = String(
                targetExtra.severity || "",
              ).toUpperCase();

              if (rawSeverityString === "ERROR") translatedSeverity = "High";
              else if (rawSeverityString === "WARNING")
                translatedSeverity = "Medium";
              else if (rawSeverityString === "INFO") translatedSeverity = "Low";

              findings.push({
                file_path: relativePath,
                vulnerability_name: `Code Flaw: ${ruleIdName}`,
                severity: translatedSeverity,
                code_snippet: `Details: ${targetExtra.message || "No description"}\n\nCode context:\n${targetExtra.lines || ""}`,
              });
            }
          }
        } catch (e: any) {
          process.stderr.write(
            `[SEMGREP_PARSE_ERROR] Failed to parse Semgrep JSON: ${e.message}\n`,
          );
        }
      }

      // ==========================================
      // PARSER 2: GITLEAKS (Secrets & Keys)
      // ==========================================
      if (fs.existsSync(gitleaksOutputPath)) {
        try {
          const gitleaksRaw = fs.readFileSync(gitleaksOutputPath, "utf8");
          if (gitleaksRaw.trim().length > 0) {
            const gitleaksResults = JSON.parse(gitleaksRaw) || [];
            process.stdout.write(
              `[GITLEAKS_PARSER] Extracted ${gitleaksResults.length} findings.\n`,
            );

            for (const leak of gitleaksResults) {
              const relativePath = (leak.File || "unknown_file").replace(
                workspacePath + "/",
                "",
              );
              findings.push({
                file_path: relativePath,
                vulnerability_name: `Exposed Secret: ${leak.Description || "Hardcoded Key"}`,
                severity: "Critical",
                code_snippet: `Match string: ${leak.Match}\nLocated on Line: ${leak.StartLine || "Unknown"}`,
              });
            }
          }
        } catch (e: any) {
          process.stderr.write(
            `[GITLEAKS_PARSE_ERROR] Failed to parse Gitleaks JSON: ${e.message}\n`,
          );
        }
      }

      // ==========================================
      // PARSER 3: TRIVY (SCA - Dependencies)
      // ==========================================
      if (fs.existsSync(trivyOutputPath)) {
        try {
          const trivyRaw = fs.readFileSync(trivyOutputPath, "utf8");
          if (trivyRaw.trim().length > 0) {
            const trivyData = JSON.parse(trivyRaw);
            const trivyResults = trivyData.Results || [];
            let trivyCount = 0;

            for (const res of trivyResults) {
              const relativePath = (res.Target || "package_manifest").replace(
                workspacePath + "/",
                "",
              );
              for (const vuln of res.Vulnerabilities || []) {
                trivyCount++;
                let mappedSev: "Low" | "Medium" | "High" | "Critical" =
                  "Medium";
                const tSev = String(vuln.Severity || "").toUpperCase();

                if (tSev === "CRITICAL") mappedSev = "Critical";
                else if (tSev === "HIGH") mappedSev = "High";
                else if (tSev === "LOW" || tSev === "UNKNOWN")
                  mappedSev = "Low";

                findings.push({
                  file_path: relativePath,
                  vulnerability_name: `Vulnerable Dependency: ${vuln.PkgName} (${vuln.VulnerabilityID})`,
                  severity: mappedSev,
                  code_snippet: `Package: ${vuln.PkgName}\nInstalled Version: ${vuln.InstalledVersion}\nFixed in: ${vuln.FixedVersion || "No fix available"}\nDescription: ${vuln.Title || vuln.Description || "N/A"}`,
                });
              }
            }
            process.stdout.write(
              `[TRIVY_PARSER] Extracted ${trivyCount} findings.\n`,
            );
          }
        } catch (e: any) {
          process.stderr.write(
            `[TRIVY_PARSE_ERROR] Failed to parse Trivy JSON: ${e.message}\n`,
          );
        }
      }
    } catch (err: any) {
      process.stderr.write(
        `[GIT_SCAN_CRASH] [${new Date().toISOString()}] Git execution failure trace down: ${err.message}\n`,
      );
      throw new Error(
        "Repository cloning or static analysis processing execution failed.",
      );
    } finally {
      // Disk Cleanup Routine
      const filesToClean = [
        semgrepIgnorePath,
        semgrepOutputPath,
        gitleaksOutputPath,
        trivyOutputPath,
      ];
      for (const filePath of filesToClean) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (cleanupErr: any) {
          process.stderr.write(
            `[DISK_WARNING] Failed to clean file ${filePath}: ${cleanupErr.message}\n`,
          );
        }
      }

      try {
        if (fs.existsSync(workspacePath)) {
          process.stdout.write(
            `[GIT_SCAN_CLEANUP] [${new Date().toISOString()}] Purging ephemeral repository workspace folder structure...\n`,
          );
          fs.rmSync(workspacePath, { recursive: true, force: true });
        }
      } catch (cleanupErr: any) {
        process.stderr.write(
          `[DISK_WARNING] [${new Date().toISOString()}] Failed to clean temp repository workspace: ${cleanupErr.message}\n`,
        );
      }
    }

    // Deduplicate identical findings across tools to save AI tokens
    const dedupedFindings: GitScanFinding[] = [];
    const seenFindingKeys = new Set<string>();
    for (const f of findings) {
      // Throttle array to prevent completely blowing out the AI prompt limit
      if (dedupedFindings.length >= 75) break;

      const dedupKey = `${f.vulnerability_name}|${f.file_path}|${f.code_snippet.substring(0, 40)}`;
      if (seenFindingKeys.has(dedupKey)) continue;
      seenFindingKeys.add(dedupKey);
      dedupedFindings.push(f);
    }

    process.stdout.write(
      `[GIT_SCAN_FINALIZE] [${new Date().toISOString()}] Multi-engine scan sweep complete. Findings: ${dedupedFindings.length} (deduped from ${findings.length})\n`,
    );

    return {
      findings: dedupedFindings,
      context: discoveredContext,
    };
  },
};
