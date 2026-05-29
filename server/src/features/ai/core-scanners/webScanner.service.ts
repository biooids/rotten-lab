//src/features/core-scanners/webScanner.service.ts

import { chromium } from "playwright";
import dns from "node:dns/promises";
import { URL } from "node:url";

export interface WebScanFinding {
  file_path: string;
  vulnerability_name: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  code_snippet: string;
}

const WEB_SCAN_RULES = [
  {
    name: "Exposed Client-Side Firebase Admin/API Keys",
    severity: "High" as const,
    regex: /AIzaSy[0-9A-Za-z\-_]{33}/g,
  },
  {
    name: "Exposed Stripe Publishable/Secret Keys",
    severity: "High" as const,
    regex: /(?:pk_live_|sk_live_)[a-zA-Z0-9]{24,}/g,
  },
  {
    name: "Exposed Internal Bearer / JWT Secret Payload Token",
    severity: "High" as const,
    regex: /eyJhbGciOi[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
  },
  {
    name: "Leaked Production Database Credentials Configuration",
    severity: "Critical" as const,
    regex:
      /(?:postgres|mysql|mongodb):\/\/[\w\d\-_\+:]+@[\w\d\.\-_]+:\d+\/[\w\d\.\-_]+/gi,
  },
  {
    name: "Shipped Development Source-Map Access Link",
    severity: "Low" as const,
    regex: /\/\/#\s*sourceMappingURL=[A-Za-z0-9\._\-]+\.map/g,
  },
  {
    name: "Exposed GitHub Personal Access Token",
    severity: "Critical" as const,
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
  },
  {
    name: "Exposed AWS Access Key ID",
    severity: "Critical" as const,
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: "Exposed Slack Token",
    severity: "High" as const,
    regex: /\bxox[bpoars]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    name: "Exposed SendGrid API Key",
    severity: "High" as const,
    regex: /\bSG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}\b/g,
  },
  {
    name: "Exposed Twilio API Key SID",
    severity: "High" as const,
    regex: /\bSK[0-9a-f]{32}\b/g,
  },
  {
    name: "Exposed npm Access Token",
    severity: "High" as const,
    regex: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    name: "Exposed Google OAuth Client Secret",
    severity: "High" as const,
    regex: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: "Embedded Private Key Block",
    severity: "Critical" as const,
    regex:
      /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/g,
  },
];

// Aggressive Fuzzing Payloads for the advanced DOM fuzzer
const FUZZ_PAYLOADS = [
  `"><svg/onload=prompt('APPSEC_SCAN_XSS')>`, // Active XSS reflection check
  `' OR 1=1 --`, // Classic SQLi bypass
  `{"$gt": ""}`, // NoSQL injection check for modern JSON APIs
];

// Heuristic Keywords for prioritizing deep targets
const HIGH_PRIORITY_TERMS = [
  "admin",
  "login",
  "auth",
  "dashboard",
  "account",
  "settings",
  "profile",
  "api",
  "user",
];

export const webScannerService = {
  // SSRF Protection Layer: Resolves DNS and strictly rejects private, loopback, and metadata IPs
  async validateNetworkTarget(targetUrl: string): Promise<void> {
    try {
      const parsed = new URL(targetUrl);
      const hostname = parsed.hostname;

      // Resolve ALL records (A + AAAA) so an attacker can't slip through via IPv6
      const lookups = await dns.lookup(hostname, { all: true });

      for (const lookup of lookups) {
        const ip = lookup.address;
        const family = lookup.family;

        // IPv4 blacklist
        if (family === 4) {
          if (ip === "169.254.169.254") throw new Error("SSRF Protection");
          if (ip.startsWith("127.") || ip === "0.0.0.0")
            throw new Error("SSRF Protection");
          if (ip.startsWith("10.") || ip.startsWith("192.168."))
            throw new Error("SSRF Protection");
          if (ip.startsWith("169.254.")) throw new Error("SSRF Protection");
          if (ip.startsWith("172.")) {
            const secondOctet = parseInt(ip.split(".")[1]!, 10);
            if (secondOctet >= 16 && secondOctet <= 31)
              throw new Error("SSRF Protection");
          }
        }

        // IPv6 blacklist
        if (family === 6) {
          const lower = ip.toLowerCase();
          if (lower === "::1" || lower === "::")
            throw new Error("SSRF Protection");
          if (lower.startsWith("fe80:") || lower.startsWith("fe80::"))
            throw new Error("SSRF Protection");
          if (lower.startsWith("fc") || lower.startsWith("fd"))
            throw new Error("SSRF Protection");
          if (lower.startsWith("::ffff:")) {
            const tail = lower.split("::ffff:")[1] || "";
            if (
              tail === "169.254.169.254" ||
              tail.startsWith("127.") ||
              tail.startsWith("10.") ||
              tail.startsWith("192.168.") ||
              tail.startsWith("169.254.")
            ) {
              throw new Error("SSRF Protection");
            }
            if (tail.startsWith("172.")) {
              const secondOctet = parseInt(tail.split(".")[1]!, 10);
              if (secondOctet >= 16 && secondOctet <= 31)
                throw new Error("SSRF Protection");
            }
          }
        }
      }
    } catch (err: any) {
      if (err.message === "SSRF Protection") {
        throw new Error(
          "Security Violation: Requesting internal or metadata IP addresses is strictly prohibited.",
        );
      }
      throw new Error(
        `DNS Resolution Failed: Unable to verify host ${targetUrl}`,
      );
    }
  },

  async runScan(targetUrl: string): Promise<WebScanFinding[]> {
    const findings: WebScanFinding[] = [];
    const timestamp = new Date().toISOString();

    process.stdout.write(
      `[WEB_SCAN_START] [${timestamp}] Spawning deep crawable DAST web spider explorer map analyzer for target: ${targetUrl}\n`,
    );

    await this.validateNetworkTarget(targetUrl);

    const parsedTargetRoot = new URL(targetUrl);
    const originTargetRootString = parsedTargetRoot.origin;

    // Concurrency Queues and State Trackers
    const priorityQueue: string[] = [];
    const standardQueue: string[] = [targetUrl];
    const visitedUrls = new Set<string>();

    let activeWorkers = 0;
    let pagesVisitedCount = 0;
    const MAX_PAGES_TO_VISIT = 15;
    const MAX_CONCURRENT_WORKERS = 3;

    process.stdout.write(
      `[WEB_SCAN_BROWSER] Launching headless Chromium multi-page instance loop container with ${MAX_CONCURRENT_WORKERS} workers...\n`,
    );

    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-gpu"],
    });

    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 AppSec-Review-Terminal/1.0",
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
      });

      // CONCURRENT WORKER FUNCTION
      const workerProcess = async (workerId: number) => {
        // Infinite loop kept alive as long as there is work or active workers
        while (true) {
          if (pagesVisitedCount >= MAX_PAGES_TO_VISIT) break;

          // Pull from priority queue first, otherwise take standard queue
          const currentUrlToScan =
            priorityQueue.shift() || standardQueue.shift();

          if (!currentUrlToScan) {
            // FIX: Worker Starvation Prevention
            // If the queue is empty but another worker is actively crawling a page,
            // wait 500ms and check the queue again for newly discovered links.
            if (activeWorkers > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            } else {
              // If no workers are active and the queue is empty, the site is fully mapped.
              break;
            }
          }

          if (visitedUrls.has(currentUrlToScan)) continue;
          visitedUrls.add(currentUrlToScan);

          pagesVisitedCount++;
          activeWorkers++; // Signal to other workers that we are busy processing a page

          process.stdout.write(
            `[SPIDER_WORKER_${workerId}] Processing execution sweep page [${pagesVisitedCount}/${MAX_PAGES_TO_VISIT}]: ${currentUrlToScan}\n`,
          );

          try {
            const page = await context.newPage();

            // OPTIMIZATION: Network Request Interception Layer (Block images/media)
            await page.route("**/*", (route) => {
              const type = route.request().resourceType();
              if (["image", "media", "font", "stylesheet"].includes(type)) {
                route.abort();
              } else {
                route.continue();
              }
            });

            await page.route("**/api/**", async (route) => {
              const request = route.request();
              const method = request.method();

              if (method === "POST" || method === "PUT" || method === "PATCH") {
                const contentType = request.headers()["content-type"] || "";

                if (contentType.includes("application/json")) {
                  try {
                    const originalData = JSON.parse(request.postData() || "{}");
                    const fuzzedData = { ...originalData };

                    // Morph payload strings into structural MongoDB Operator Objects
                    for (const key in fuzzedData) {
                      if (typeof fuzzedData[key] === "string") {
                        // Transforms {"username": "admin"} into {"username": {"$ne": null}}
                        fuzzedData[key] = { $ne: null };
                      }
                    }

                    // Forward the corrupted structural data to the API
                    await route.continue({
                      postData: JSON.stringify(fuzzedData),
                    });
                    return;
                  } catch (e) {
                    // Fall back to safety if parsing fails
                  }
                }
              }
              await route.continue();
            });

            // NETWORK INTERCEPTOR: Deep JSON & GraphQL Analysis
            page.on("response", async (response) => {
              const url = response.url();
              const request = response.request();

              try {
                const contentType = response.headers()["content-type"] || "";
                const status = response.status();

                // Block 1: Catch GraphQL Introspection & Data Queries
                if (url.includes("/graphql") && request.method() === "POST") {
                  const responseBody = await response.text();

                  for (const rule of WEB_SCAN_RULES) {
                    rule.regex.lastIndex = 0;
                    if (rule.regex.test(responseBody)) {
                      const matchIndex = responseBody.search(rule.regex);
                      const startExtract = Math.max(0, matchIndex - 150);
                      const endExtract = Math.min(
                        responseBody.length,
                        matchIndex + 350,
                      );
                      const extractedSnippet = responseBody.substring(
                        startExtract,
                        endExtract,
                      );

                      findings.push({
                        file_path: `GraphQL Endpoint: ${url}`,
                        vulnerability_name: `${rule.name} (Caught via GraphQL Response Payload)`,
                        severity: rule.severity,
                        code_snippet: `... ${extractedSnippet.trim()} ...`,
                      });
                    }
                  }
                }
                // Block 2: Standard JSON/JS Bundles
                else if (
                  contentType.includes("javascript") ||
                  contentType.includes("json") ||
                  url.endsWith(".js") ||
                  url.endsWith(".json")
                ) {
                  if (status < 200 || status >= 300) return;

                  const bodyText = await response.text();

                  for (const rule of WEB_SCAN_RULES) {
                    rule.regex.lastIndex = 0;
                    if (rule.regex.test(bodyText)) {
                      const matchIndex = bodyText.search(rule.regex);
                      const startExtract = Math.max(0, matchIndex - 150);
                      const endExtract = Math.min(
                        bodyText.length,
                        matchIndex + 350,
                      );
                      const extractedSnippet = bodyText.substring(
                        startExtract,
                        endExtract,
                      );

                      findings.push({
                        file_path: url,
                        vulnerability_name: `${rule.name} (Caught via Network Bundle stream)`,
                        severity: rule.severity,
                        code_snippet: `... ${extractedSnippet.trim()} ...`,
                      });
                    }
                  }

                  // Block 3: AI Deep Scan Pipeline (Small Files Only)
                  if (
                    (contentType.includes("javascript") ||
                      url.endsWith(".js")) &&
                    status === 200
                  ) {
                    const contentLength = parseInt(
                      response.headers()["content-length"] || "0",
                      10,
                    );

                    // Only feed small files (under ~15KB) to the AI to prevent token limits
                    if (contentLength > 0 && contentLength < 150000) {
                      const smallScriptBody = await response.text();

                      // Push the entire small script as a unique finding type
                      findings.push({
                        file_path: `Small Client Script: ${url}`,
                        vulnerability_name:
                          "AI Deep Source Code Analysis Trigger",
                        severity: "Low", // This is just a trigger, the AI will determine true severity
                        code_snippet: smallScriptBody, // Sending the whole small script
                      });
                    }
                  }
                }
              } catch (respErr: any) {
                // Passively ignore network processing timeouts
              }
            });

            try {
              const mainResponse = await page.goto(currentUrlToScan, {
                waitUntil: "networkidle",
                timeout: 12000, // 12 seconds
              });

              if (mainResponse) {
                const headers = mainResponse.headers();

                if (!headers["strict-transport-security"]) {
                  findings.push({
                    file_path: `HTTP Headers: ${currentUrlToScan}`,
                    vulnerability_name:
                      "Missing Strict-Transport-Security (HSTS) Header",
                    severity: "Medium",
                    code_snippet:
                      "Strict-Transport-Security header is missing from the server response profile map.",
                  });
                }

                if (!headers["content-security-policy"]) {
                  findings.push({
                    file_path: `HTTP Headers: ${currentUrlToScan}`,
                    vulnerability_name:
                      "Missing Content-Security-Policy (CSP) Header",
                    severity: "High",
                    code_snippet:
                      "Content-Security-Policy header is missing, leaving application layout vulnerable.",
                  });
                } else {
                  const cspValue = headers["content-security-policy"] || "";
                  if (/unsafe-inline/i.test(cspValue)) {
                    findings.push({
                      file_path: `HTTP Headers: ${currentUrlToScan}`,
                      vulnerability_name:
                        "Permissive Content-Security-Policy: unsafe-inline allowed",
                      severity: "High",
                      code_snippet: `CSP directive contains 'unsafe-inline': ${cspValue.substring(0, 150)}`,
                    });
                  }
                }

                if (
                  !headers["x-frame-options"] &&
                  !headers["content-security-policy"]?.includes(
                    "frame-ancestors",
                  )
                ) {
                  findings.push({
                    file_path: `HTTP Headers: ${currentUrlToScan}`,
                    vulnerability_name:
                      "Missing X-Frame-Options (Clickjacking Protection)",
                    severity: "Medium",
                    code_snippet:
                      "X-Frame-Options header verification missing entirely.",
                  });
                }
              }
            } catch (navError: any) {
              process.stderr.write(
                `[SPIDER_WORKER_${workerId}] Networkidle failed, fallback DOM sweep: ${currentUrlToScan}\n`,
              );
              try {
                await page.goto(currentUrlToScan, {
                  waitUntil: "domcontentloaded",
                  timeout: 8000,
                });
              } catch (fallbackError: any) {
                await page.close();
                continue; // Move to the finally block to decrement activeWorkers
              }
            }

            const pageSessionCookies = await context.cookies();
            for (const targetCookie of pageSessionCookies) {
              if (!targetCookie.secure) {
                findings.push({
                  file_path: `Cookie: ${targetCookie.name} on ${currentUrlToScan}`,
                  vulnerability_name: "Insecure Cookie Flag",
                  severity: "Medium",
                  code_snippet: `Set-Cookie Flag validation missing: ${targetCookie.name}=***; Domain=${targetCookie.domain}`,
                });
              }
            }

            // DEEP SPA INTERACTION (Clicking buttons to trigger React state changes)
            try {
              const clickables = await page
                .locator('button, [role="button"]')
                .all();
              const maxClicks = Math.min(clickables.length, 3);
              for (let i = 0; i < maxClicks; i++) {
                // FIXED TypeScript Array Access (assigned to constant first)
                const element = clickables[i];
                if (element) {
                  await element.click({ timeout: 2000 }).catch(() => {});
                  await page.waitForTimeout(300);
                }
              }
            } catch (e) {}

            // ADVANCED INPUT FUZZING (XSS, SQLi, NoSQLi)
            try {
              const inputs = await page
                .locator(
                  'input[type="text"], input[type="search"], textarea, input[type="email"]',
                )
                .all();

              const maxInputs = Math.min(inputs.length, 3);
              for (let i = 0; i < maxInputs; i++) {
                const inputElement = inputs[i];
                // FIXED TypeScript Array Access
                if (
                  inputElement &&
                  (await inputElement.isVisible().catch(() => false))
                ) {
                  for (const payload of FUZZ_PAYLOADS) {
                    await inputElement.fill(payload).catch(() => {});
                    await inputElement.press("Enter").catch(() => {});
                    await page.waitForTimeout(500); // Give SPA a moment to react

                    const domContent = await page.content().catch(() => "");
                    if (domContent.includes(payload)) {
                      findings.push({
                        file_path: currentUrlToScan,
                        vulnerability_name: `Input Reflection / Potential Injection Vulnerability`,
                        severity: "Critical",
                        code_snippet: `Application unsafely reflected or executed test payload: ${payload}`,
                      });
                    }
                  }
                }
              }
            } catch (fuzzErr) {}

            // DOM & FRAMEWORK STATE EXTRACTION
            const frameExtractionResults = await page.evaluate(() => {
              const docGlobal = (globalThis as any).document;
              const locStorageGlobal = (globalThis as any).localStorage;

              const memoryObjectDump: Record<string, string> = {};
              const frameworkStateDump: string[] = [];

              if (locStorageGlobal) {
                for (let i = 0; i < locStorageGlobal.length; i++) {
                  const key = locStorageGlobal.key(i);
                  if (key)
                    memoryObjectDump[`localStorage: ${key}`] =
                      locStorageGlobal.getItem(key) || "";
                }
              }

              const nextData = (globalThis as any).__NEXT_DATA__;
              if (nextData)
                frameworkStateDump.push(
                  `Next.js State Dump: ${JSON.stringify(nextData)}`,
                );

              let extractedLinks: string[] = [];
              if (docGlobal) {
                extractedLinks = Array.from(
                  docGlobal.querySelectorAll("a[href]"),
                )
                  .map((anchor: any) => anchor.href)
                  .filter((hrefStr: string) => hrefStr.trim().length > 0);
              }

              return {
                storage: memoryObjectDump,
                frameworkStates: frameworkStateDump,
                discoveredLinks: extractedLinks,
              };
            });

            // Evaluate Web Storage
            for (const [
              keyStoreMapName,
              valueStoreMapContext,
            ] of Object.entries(frameExtractionResults.storage)) {
              if (
                /token|jwt|auth|secret/i.test(keyStoreMapName) &&
                valueStoreMapContext.length > 20
              ) {
                findings.push({
                  file_path: `Web Storage API [${currentUrlToScan}]`,
                  vulnerability_name: "Sensitive Authentication Data Leakage",
                  severity: "High",
                  code_snippet: `${keyStoreMapName} = "${valueStoreMapContext.substring(0, 50)}..."`,
                });
              }
              for (const rule of WEB_SCAN_RULES) {
                rule.regex.lastIndex = 0;
                if (rule.regex.test(valueStoreMapContext)) {
                  findings.push({
                    file_path: `Storage API [${currentUrlToScan}]`,
                    vulnerability_name: `${rule.name}`,
                    severity: rule.severity,
                    code_snippet: `${keyStoreMapName} matches sensitive profile signature.`,
                  });
                }
              }
            }

            // Evaluate Framework State Dumps (Next.js / Redux)
            for (const stateDump of frameExtractionResults.frameworkStates) {
              for (const rule of WEB_SCAN_RULES) {
                rule.regex.lastIndex = 0;
                if (rule.regex.test(stateDump)) {
                  findings.push({
                    file_path: `Framework Hydration State [${currentUrlToScan}]`,
                    vulnerability_name: `${rule.name} (Leaked via Framework payload)`,
                    severity: rule.severity,
                    code_snippet: `[Object State Dump Matched Signature]`,
                  });
                }
              }
            }

            // HEURISTIC QUEUE ROUTING for newly discovered links
            for (const linkHref of frameExtractionResults.discoveredLinks) {
              try {
                const urlInstance = new URL(linkHref, originTargetRootString);
                if (urlInstance.origin === originTargetRootString) {
                  const cleanLink = urlInstance.href.split("#")[0]!;

                  if (
                    !visitedUrls.has(cleanLink) &&
                    !priorityQueue.includes(cleanLink) &&
                    !standardQueue.includes(cleanLink)
                  ) {
                    // Determine priority based on heuristic keywords
                    const isHighPriority = HIGH_PRIORITY_TERMS.some((term) =>
                      cleanLink.toLowerCase().includes(term),
                    );
                    if (isHighPriority) {
                      priorityQueue.push(cleanLink);
                    } else {
                      standardQueue.push(cleanLink);
                    }
                  }
                }
              } catch (e) {}
            }

            await page.close();
          } finally {
            // No matter what happens (success or crash), we must signal that the worker is done with the page
            activeWorkers--;
          }
        }
      };

      // Launch the concurrent worker pool
      const workerPromises = [];
      for (let i = 1; i <= MAX_CONCURRENT_WORKERS; i++) {
        workerPromises.push(workerProcess(i));
      }

      // Wait for all 3 workers to gracefully complete the queues
      await Promise.all(workerPromises);
    } catch (err: any) {
      process.stderr.write(
        `[WEB_SCAN_CRASH] Engine system loop execution failure detail notation: ${err.message}\n`,
      );
      throw new Error(
        "Target web application infrastructure failed to process cleanly within parameters.",
      );
    } finally {
      process.stdout.write(
        `[WEB_SCAN_CLEANUP] Closing Chromium headless instance workspace pool cleanup container.\n`,
      );
      await browser.close();
    }

    // Dedupe
    const dedupedFindings: WebScanFinding[] = [];
    const seenFindingKeys = new Set<string>();

    for (const f of findings) {
      // Re-added file_path to the dedup key to ensure we don't accidentally drop
      // identical header vulnerabilities across multiple different pages.
      const dedupKey = `${f.vulnerability_name}|${f.file_path}|${f.code_snippet.substring(0, 40)}`;
      if (seenFindingKeys.has(dedupKey)) continue;
      seenFindingKeys.add(dedupKey);
      dedupedFindings.push(f);
    }

    process.stdout.write(
      `[WEB_SCAN_FINALIZE] Web application path crawler spider scan finished completely. Findings gathered: ${dedupedFindings.length} (deduped from ${findings.length})\n`,
    );
    return dedupedFindings;
  },
};
