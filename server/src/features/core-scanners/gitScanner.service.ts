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
    const semgrepIgnorePath = path.join(workspacePath, ".semgrepignore");
    // Spool Semgrep JSON to a file so we don't lose findings to a tripped maxBuffer
    const semgrepOutputPath = path.join(
      os.tmpdir(),
      `appsec-semgrep-${randomId}.json`,
    );

    try {
      // Pre-clone size guard — ask GitHub how big the repo is BEFORE cloning. Cheap defense
      // against someone submitting torvalds/linux and freezing the disk. GitHub returns size in KB.
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
            // Hard cap at 500MB — generous, but rejects mono-repos that would freeze the host
            if (sizeKb > 500 * 1024) {
              throw new Error(
                `Repository too large for scan engine: ${sizeMb.toFixed(0)} MB (cap is 500 MB). Try a smaller repo or a sub-path.`,
              );
            }
          } else {
            // GitHub returns 403 with X-RateLimit-Remaining: 0 when the unauthenticated
            // limit (60/hour per IP) is exhausted. Distinguish this from a 404
            // (repo doesn't exist or is private) so we don't blame the user when it's
            // really our IP getting hammered. We still proceed without the size guard,
            // but log the cause clearly so ops can grep [GITHUB_RATE_LIMITED] and decide
            // whether to add a GITHUB_TOKEN to lift the cap to 5000/hour.
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
                `[GITHUB_RATE_LIMITED] Unauthenticated GitHub API exhausted (60/hr cap hit). Resets at ${resetIso}. Size pre-check skipped — clone will proceed without size guard. Set a GITHUB_TOKEN env var to lift the limit.\n`,
              );
            } else if (sizeRes.status === 404) {
              process.stderr.write(
                `[GIT_SCAN_SIZE_CHECK] GitHub API 404 — repo not found or is private. Proceeding to clone (will fail if private).\n`,
              );
            } else {
              process.stderr.write(
                `[GIT_SCAN_SIZE_CHECK] GitHub API replied ${sizeRes.status} (rate-remaining=${rateLimitRemaining}) — proceeding without size guard.\n`,
              );
            }
          }
        }
      } catch (sizeCheckErr: any) {
        if (sizeCheckErr.message?.includes("Repository too large")) {
          throw sizeCheckErr; // re-raise hard size cap
        }
        // Network failure to GitHub API is non-fatal — proceed with clone
        process.stderr.write(
          `[GIT_SCAN_SIZE_CHECK] Size pre-check failed softly: ${sizeCheckErr.message}\n`,
        );
      }

      process.stdout.write(
        `[GIT_SCAN_CLONE] [${new Date().toISOString()}] Cloning repository via secure async child process into ephemeral workspace...\n`,
      );

      // Async execFile — event loop stays responsive while clone runs.
      // Wrap separately so we can distinguish "git binary not installed on this host"
      // (ENOENT — server misconfiguration) from "clone failed because repo is private
      // or doesn't exist" (different exit code) from "network/timeout".
      try {
        await execFileAsync(
          "git",
          ["clone", "--depth", "1", repoUrl, workspacePath],
          { timeout: 45000 },
        );
      } catch (cloneErr: any) {
        if (cloneErr?.code === "ENOENT") {
          process.stderr.write(
            `[GIT_SCAN_CLONE_MISSING_BIN] 'git' binary not found on PATH. This is a server provisioning bug. err=${cloneErr.message}\n`,
          );
          throw new Error(
            "Server is missing the 'git' binary. The administrator needs to install git on the host. This is not your fault.",
          );
        }
        if (cloneErr?.killed && cloneErr?.signal === "SIGTERM") {
          throw new Error(
            "Repository clone exceeded the 45-second timeout. The repo is too large or your network to GitHub is slow.",
          );
        }
        const stderrText = String(cloneErr?.stderr || "").substring(0, 500);
        if (
          stderrText.includes("Repository not found") ||
          stderrText.includes("not found")
        ) {
          throw new Error(
            "GitHub returned 'Repository not found'. Either the repo doesn't exist or it's private (private repo scanning isn't supported yet).",
          );
        }
        process.stderr.write(
          `[GIT_SCAN_CLONE_FAIL] code=${cloneErr?.code} signal=${cloneErr?.signal} | ${cloneErr?.message}\nstderr: ${stderrText}\n`,
        );
        throw new Error(
          `Repository clone failed: ${cloneErr?.message?.substring(0, 200) || "unknown error"}`,
        );
      }

      process.stdout.write(
        `[GIT_SCAN_CONTEXT] [${new Date().toISOString()}] Sweeping workspace directory for architecture framework manifests...\n`,
      );

      // Manifest detection — check the most popular ecosystem files at the repo root.
      // First match wins (priority is roughly: most popular / most informative first).
      // Truncate manifest contents to 8 KB so a huge package-lock-style file doesn't
      // dominate the AI prompt and starve the actual findings of attention.
      const packageJsonPath = path.join(workspacePath, "package.json");
      const goModPath = path.join(workspacePath, "go.mod");
      const pyprojectTomlPath = path.join(workspacePath, "pyproject.toml");
      const requirementsTxtPath = path.join(workspacePath, "requirements.txt");
      const cargoTomlPath = path.join(workspacePath, "Cargo.toml");
      const pomXmlPath = path.join(workspacePath, "pom.xml");
      const buildGradlePath = path.join(workspacePath, "build.gradle");
      const buildGradleKtsPath = path.join(workspacePath, "build.gradle.kts");
      const composerJsonPath = path.join(workspacePath, "composer.json");
      const gemfilePath = path.join(workspacePath, "Gemfile");

      if (fs.existsSync(packageJsonPath)) {
        try {
          const content = fs
            .readFileSync(packageJsonPath, "utf8")
            .substring(0, 8192);
          discoveredContext = `Node.js project detected. package.json manifests contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured package.json project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading package.json: ${e.message}\n`,
          );
        }
      } else if (fs.existsSync(goModPath)) {
        try {
          const content = fs.readFileSync(goModPath, "utf8").substring(0, 8192);
          discoveredContext = `Go language project detected. go.mod manifest contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured go.mod project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading go.mod: ${e.message}\n`,
          );
        }
      } else if (fs.existsSync(pyprojectTomlPath)) {
        try {
          const content = fs
            .readFileSync(pyprojectTomlPath, "utf8")
            .substring(0, 8192);
          discoveredContext = `Python project detected (modern). pyproject.toml manifest contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured pyproject.toml project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading pyproject.toml: ${e.message}\n`,
          );
        }
      } else if (fs.existsSync(requirementsTxtPath)) {
        try {
          const content = fs
            .readFileSync(requirementsTxtPath, "utf8")
            .substring(0, 8192);
          discoveredContext = `Python dependencies list detected. requirements.txt contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured requirements.txt project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading requirements.txt: ${e.message}\n`,
          );
        }
      } else if (fs.existsSync(cargoTomlPath)) {
        try {
          const content = fs
            .readFileSync(cargoTomlPath, "utf8")
            .substring(0, 8192);
          discoveredContext = `Rust project detected. Cargo.toml manifest contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured Cargo.toml project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading Cargo.toml: ${e.message}\n`,
          );
        }
      } else if (fs.existsSync(pomXmlPath)) {
        try {
          const content = fs
            .readFileSync(pomXmlPath, "utf8")
            .substring(0, 8192);
          discoveredContext = `Java/Maven project detected. pom.xml manifest contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured pom.xml project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading pom.xml: ${e.message}\n`,
          );
        }
      } else if (fs.existsSync(buildGradlePath)) {
        try {
          const content = fs
            .readFileSync(buildGradlePath, "utf8")
            .substring(0, 8192);
          discoveredContext = `Java/Gradle project detected. build.gradle manifest contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured build.gradle project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading build.gradle: ${e.message}\n`,
          );
        }
      } else if (fs.existsSync(buildGradleKtsPath)) {
        try {
          const content = fs
            .readFileSync(buildGradleKtsPath, "utf8")
            .substring(0, 8192);
          discoveredContext = `Kotlin/Gradle project detected. build.gradle.kts manifest contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured build.gradle.kts project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading build.gradle.kts: ${e.message}\n`,
          );
        }
      } else if (fs.existsSync(composerJsonPath)) {
        try {
          const content = fs
            .readFileSync(composerJsonPath, "utf8")
            .substring(0, 8192);
          discoveredContext = `PHP project detected. composer.json manifest contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured composer.json project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading composer.json: ${e.message}\n`,
          );
        }
      } else if (fs.existsSync(gemfilePath)) {
        try {
          const content = fs
            .readFileSync(gemfilePath, "utf8")
            .substring(0, 8192);
          discoveredContext = `Ruby project detected. Gemfile manifest contents: ${content}`;
          process.stdout.write(
            `[GIT_SCAN_CONTEXT_FOUND] Captured Gemfile project context metadata successfully.\n`,
          );
        } catch (e: any) {
          process.stderr.write(
            `[CONTEXT_ERR] Failed reading Gemfile: ${e.message}\n`,
          );
        }
      }

      process.stdout.write(
        `[GIT_SCAN_IGNORE_CONFIG] [${new Date().toISOString()}] Generating strict dynamic .semgrepignore file to prevent memory exhaustion and false positives...\n`,
      );

      // Robust exclude list to prevent AST parser from crashing on heavy dependency bundles
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

# 5. Testing, Docs, & Static Code Coverage
coverage/
.nyc_output/
*.test.js
*.spec.js
*.test.ts
*.spec.ts
spec/
tests/

# 6. Compiled, Minified, Data, & Asset Files
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
        `[GIT_SCAN_SEMGREP] [${new Date().toISOString()}] Invoking Semgrep CLI AST security engine analyzer (async, output spooled to file)...\n`,
      );

      // Use a fixed ruleset instead of --config=auto so:
      //   (a) we're not network-dependent on each scan (auto pulls rules from the registry)
      //   (b) results are reproducible across scans
      // Use --output to spool to a file so a massive JSON blob can't blow past maxBuffer
      // and silently lose all findings.
      try {
        await execFileAsync(
          "semgrep",
          [
            "scan",
            "--json",
            "--quiet",
            "--config=p/security-audit",
            "--config=p/secrets",
            "--output",
            semgrepOutputPath,
            workspacePath,
          ],
          {
            timeout: 120000, // 2 minutes
            // maxBuffer here only constrains stderr since stdout goes to --output file
            maxBuffer: 4 * 1024 * 1024,
          },
        );
      } catch (semgrepErr: any) {
        // Semgrep exits non-zero when it finds vulnerabilities — that's expected and the
        // output file is still written. Three failure modes we need to distinguish:
        //   1. ENOENT — the 'semgrep' binary isn't installed on the host. Server bug.
        //   2. Timed out — scan exceeded 120s, output file may be incomplete.
        //   3. Crashed before writing output — actual Semgrep bug or OOM.
        if (semgrepErr?.code === "ENOENT") {
          process.stderr.write(
            `[SEMGREP_MISSING_BIN] 'semgrep' binary not found on PATH. This is a server provisioning bug — install semgrep via 'pip install semgrep' or your package manager. err=${semgrepErr.message}\n`,
          );
          throw new Error(
            "Server is missing the 'semgrep' binary. The administrator needs to install Semgrep on the host. This is not your fault.",
          );
        }
        if (semgrepErr?.killed && semgrepErr?.signal === "SIGTERM") {
          process.stderr.write(
            `[SEMGREP_TIMEOUT] Semgrep exceeded the 120s timeout. Output file ${fs.existsSync(semgrepOutputPath) ? "WAS written (partial)" : "was NOT written"}.\n`,
          );
          // Don't throw — fall through and try to parse whatever was written
        } else if (!fs.existsSync(semgrepOutputPath)) {
          process.stderr.write(
            `[SEMGREP_EXEC_ERROR] Semgrep exited and produced no output file. code=${semgrepErr?.code || "n/a"} signal=${semgrepErr?.signal || "n/a"} | ${semgrepErr.message}\n`,
          );
        }
      }

      let semgrepRawOutput = "";
      if (fs.existsSync(semgrepOutputPath)) {
        semgrepRawOutput = fs.readFileSync(semgrepOutputPath, "utf8");
      }

      if (semgrepRawOutput.trim().length > 0) {
        const parsedJson = JSON.parse(semgrepRawOutput);
        const semgrepResults = parsedJson.results || [];

        process.stdout.write(
          `[GIT_SCAN_PROCESSING] Parsing ${semgrepResults.length} structured vulnerabilities found by Semgrep...\n`,
        );

        for (const targetFinding of semgrepResults) {
          if (findings.length >= 75) {
            process.stderr.write(
              `[GIT_SCAN_THROTTLE] Threshold of 75 findings reached. Halting collection translation.\n`,
            );
            break;
          }

          const rawFilePath = targetFinding.path || "unknown_file";
          const relativePath = rawFilePath.replace(workspacePath + "/", "");
          const ruleIdName =
            targetFinding.check_id || "Generic Ast Violation Rule";
          const targetExtra = targetFinding.extra || {};
          const msgDetails =
            targetExtra.message ||
            "No technical description yielded by engine rule lookup match.";
          const linesSnippet =
            targetExtra.lines || "[No source lines snippet pulled]";

          // Severity mapping uses Semgrep's structured metadata where available
          // (impact + confidence + likelihood + CWE/OWASP tags), falling back to
          // the rule's coarse ERROR/WARNING/INFO + heuristic on rule name.
          let translatedSeverity: "Low" | "Medium" | "High" | "Critical" =
            "Medium";
          const rawSeverityString = String(
            targetExtra.severity || "",
          ).toUpperCase();
          const ruleMetadata = targetExtra.metadata || {};
          const ruleImpact = String(ruleMetadata.impact || "").toUpperCase();
          const ruleConfidence = String(
            ruleMetadata.confidence || "",
          ).toUpperCase();
          const ruleLikelihood = String(
            ruleMetadata.likelihood || "",
          ).toUpperCase();
          const cweTags = Array.isArray(ruleMetadata.cwe)
            ? ruleMetadata.cwe.join(" ")
            : String(ruleMetadata.cwe || "");
          const owaspTags = Array.isArray(ruleMetadata.owasp)
            ? ruleMetadata.owasp.join(" ")
            : String(ruleMetadata.owasp || "");

          if (rawSeverityString === "ERROR") {
            translatedSeverity = "High";
          } else if (rawSeverityString === "WARNING") {
            translatedSeverity = "Medium";
          } else if (rawSeverityString === "INFO") {
            translatedSeverity = "Low";
          }

          // Bump to Critical when Semgrep itself signals HIGH impact AND HIGH confidence,
          // OR when the rule is tagged with a top-tier injection / RCE / hardcoded-secret CWE.
          // CWE-78 = OS Command Injection, CWE-89 = SQLi, CWE-94 = Code Injection,
          // CWE-502 = Deserialization, CWE-798 = Hardcoded Credentials.
          const criticalCweHit =
            /\b(?:CWE-78|CWE-89|CWE-94|CWE-502|CWE-798)\b/i.test(cweTags);
          const a01HardcodedSecret =
            /A0[12]/.test(owaspTags) &&
            /secret|credential/i.test(ruleIdName.toLowerCase());

          if (
            (ruleImpact === "HIGH" && ruleConfidence === "HIGH") ||
            (ruleImpact === "HIGH" && ruleLikelihood === "HIGH") ||
            criticalCweHit ||
            a01HardcodedSecret ||
            ruleIdName.toLowerCase().includes("secret") ||
            ruleIdName.toLowerCase().includes("injection") ||
            ruleIdName.toLowerCase().includes("rce")
          ) {
            translatedSeverity = "Critical";
          }

          // Demote to Low if Semgrep itself says LOW impact regardless of severity bucket
          if (ruleImpact === "LOW" && translatedSeverity !== "Critical") {
            translatedSeverity = "Low";
          }

          findings.push({
            file_path: relativePath,
            vulnerability_name: ruleIdName,
            severity: translatedSeverity,
            code_snippet: `Details: ${msgDetails}\n\nCode context:\n${linesSnippet}`,
          });
        }
      }
    } catch (err: any) {
      process.stderr.write(
        `[GIT_SCAN_CRASH] [${new Date().toISOString()}] Git execution failure trace down: ${err.message}\n`,
      );
      throw new Error(
        "Repository cloning or static AST analysis processing execution failed.",
      );
    } finally {
      // 1. Clean up the dynamic ignore file
      try {
        if (fs.existsSync(semgrepIgnorePath)) {
          fs.unlinkSync(semgrepIgnorePath);
        }
      } catch (cleanupErr: any) {
        process.stderr.write(
          `[DISK_WARNING] Failed to clean generated .semgrepignore file: ${cleanupErr.message}\n`,
        );
      }

      // 2. Clean up the spooled Semgrep output JSON
      try {
        if (fs.existsSync(semgrepOutputPath)) {
          fs.unlinkSync(semgrepOutputPath);
        }
      } catch (cleanupErr: any) {
        process.stderr.write(
          `[DISK_WARNING] Failed to clean spooled Semgrep output file: ${cleanupErr.message}\n`,
        );
      }

      // 3. Clean up the cloned repository workspace
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

    // Dedupe: Semgrep frequently flags the same vulnerability on consecutive lines of the
    // same file with the same rule ID. Sending each as a separate AI finding wastes tokens.
    // Key by rule + file + first 60 chars of snippet so true duplicates collapse but
    // genuinely distinct instances in the same file are preserved.
    const dedupedFindings: GitScanFinding[] = [];
    const seenFindingKeys = new Set<string>();
    for (const f of findings) {
      const dedupKey = `${f.vulnerability_name}|${f.file_path}|${f.code_snippet.substring(0, 60)}`;
      if (seenFindingKeys.has(dedupKey)) continue;
      seenFindingKeys.add(dedupKey);
      dedupedFindings.push(f);
    }

    process.stdout.write(
      `[GIT_SCAN_FINALIZE] [${new Date().toISOString()}] Static code sweep complete. Findings: ${dedupedFindings.length} (deduped from ${findings.length})\n`,
    );

    return {
      findings: dedupedFindings,
      context: discoveredContext,
    };
  },
};
