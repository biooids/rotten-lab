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
          if (ip === "169.254.169.254") throw new Error("SSRF Protection"); // AWS / GCP metadata
          if (ip.startsWith("127.") || ip === "0.0.0.0")
            throw new Error("SSRF Protection"); // Loopback / null route
          if (ip.startsWith("10.") || ip.startsWith("192.168."))
            throw new Error("SSRF Protection"); // RFC 1918
          if (ip.startsWith("169.254.")) throw new Error("SSRF Protection"); // Link-local
          if (ip.startsWith("172.")) {
            const secondOctet = parseInt(ip.split(".")[1]!, 10);
            if (secondOctet >= 16 && secondOctet <= 31)
              throw new Error("SSRF Protection"); // RFC 1918 172.16/12
          }
        }

        // IPv6 blacklist
        if (family === 6) {
          const lower = ip.toLowerCase();
          if (lower === "::1" || lower === "::") throw new Error("SSRF Protection"); // Loopback / unspecified
          if (lower.startsWith("fe80:") || lower.startsWith("fe80::"))
            throw new Error("SSRF Protection"); // Link-local fe80::/10
          // Unique local addresses fc00::/7 (covers fc** and fd**)
          if (lower.startsWith("fc") || lower.startsWith("fd"))
            throw new Error("SSRF Protection");
          // 4-in-6 mapped: ::ffff:10.0.0.1 etc — re-evaluate as IPv4
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

    const crawlQueue: string[] = [targetUrl];
    const visitedUrls = new Set<string>();
    const maxPagesToVisitLimit = 5;

    process.stdout.write(
      `[WEB_SCAN_BROWSER] Launching headless Chromium multi-page instance loop container...\n`,
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

      const page = await context.newPage();

      // OPTIMIZATION: Network Request Interception Layer (Aborting heavy media to speed up crawling)
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "media", "font", "stylesheet"].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
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
                const endExtract = Math.min(bodyText.length, matchIndex + 350);
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
          }
        } catch (respErr: any) {
          // Passively ignore network processing timeouts or aborted streams
        }
      });

      // MAIN CRAWLING LOOP
      while (crawlQueue.length > 0 && visitedUrls.size < maxPagesToVisitLimit) {
        const currentUrlToScan = crawlQueue.shift()!;

        if (visitedUrls.has(currentUrlToScan)) {
          continue;
        }

        visitedUrls.add(currentUrlToScan);
        process.stdout.write(
          `[SPIDER_CRAWL_LOOP] Processing execution sweep page [${visitedUrls.size}/${maxPagesToVisitLimit}]: ${currentUrlToScan}\n`,
        );

        try {
          // networkidle is critical here to bypass React/Next.js hydration spinners
          const mainResponse = await page.goto(currentUrlToScan, {
            waitUntil: "networkidle",
            timeout: 15000,
          });

          if (mainResponse) {
            process.stdout.write(
              `[WEB_SCAN_HEADERS] Auditing HTTP Security Headers for link path target: ${currentUrlToScan}\n`,
            );
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
                  "Content-Security-Policy header is missing, leaving application layout vulnerable to cross origin runtime scripts injection.",
              });
            } else {
              // CSP exists — audit its value for permissive directives that defeat the policy
              const cspValue = headers["content-security-policy"] || "";
              if (/unsafe-inline/i.test(cspValue)) {
                findings.push({
                  file_path: `HTTP Headers: ${currentUrlToScan}`,
                  vulnerability_name:
                    "Permissive Content-Security-Policy: unsafe-inline allowed",
                  severity: "High",
                  code_snippet: `CSP directive contains 'unsafe-inline', defeating XSS protection: ${cspValue.substring(0, 300)}`,
                });
              }
              if (/unsafe-eval/i.test(cspValue)) {
                findings.push({
                  file_path: `HTTP Headers: ${currentUrlToScan}`,
                  vulnerability_name:
                    "Permissive Content-Security-Policy: unsafe-eval allowed",
                  severity: "High",
                  code_snippet: `CSP directive contains 'unsafe-eval', permitting eval()-class sinks: ${cspValue.substring(0, 300)}`,
                });
              }
              // Wildcard in script-src / default-src is effectively no CSP
              if (
                /(?:^|;)\s*(?:default|script)-src[^;]*\*/i.test(cspValue) &&
                !/'(?:strict-dynamic|nonce-|sha256-|sha384-|sha512-)/i.test(
                  cspValue,
                )
              ) {
                findings.push({
                  file_path: `HTTP Headers: ${currentUrlToScan}`,
                  vulnerability_name:
                    "Permissive Content-Security-Policy: wildcard script source",
                  severity: "High",
                  code_snippet: `CSP allows scripts from arbitrary origins (* in default-src/script-src): ${cspValue.substring(0, 300)}`,
                });
              }
            }

            if (
              !headers["x-frame-options"] &&
              !headers["content-security-policy"]?.includes("frame-ancestors")
            ) {
              findings.push({
                file_path: `HTTP Headers: ${currentUrlToScan}`,
                vulnerability_name:
                  "Missing X-Frame-Options (Clickjacking Protection)",
                severity: "Medium",
                code_snippet:
                  "X-Frame-Options header verification missing entirely from engine headers check metadata collection mapping.",
              });
            }
          }
        } catch (navError: any) {
          process.stderr.write(
            `[SPIDER_NAV_TIMEOUT] Hard networkidle failed on link routing, fallback to active DOM rendering sweep execution: ${currentUrlToScan}\n`,
          );
          try {
            await page.goto(currentUrlToScan, {
              waitUntil: "domcontentloaded",
              timeout: 8000,
            });
          } catch (fallbackError: any) {
            process.stderr.write(
              `[SPIDER_PAGE_SKIP] Target route unavailable entirely under strict limits: ${currentUrlToScan}\n`,
            );
            continue;
          }
        }

        process.stdout.write(
          `[WEB_SCAN_COOKIES] Dumping state variables for page path location context details...\n`,
        );
        const pageSessionCookies = await context.cookies();
        for (const targetCookie of pageSessionCookies) {
          if (!targetCookie.secure) {
            findings.push({
              file_path: `Cookie context path tracing name: ${targetCookie.name} on ${currentUrlToScan}`,
              vulnerability_name:
                "Insecure Cookie Flag (Missing Secure Configuration Check)",
              severity: "Medium",
              code_snippet: `Set-Cookie Flag signature verification missing securely: ${targetCookie.name}=${targetCookie.value.substring(0, 8)}...; Domain=${targetCookie.domain}`,
            });
          }
          if (
            !targetCookie.httpOnly &&
            (targetCookie.name.toLowerCase().includes("session") ||
              targetCookie.name.toLowerCase().includes("token"))
          ) {
            findings.push({
              file_path: `Cookie context path tracing name: ${targetCookie.name} on ${currentUrlToScan}`,
              vulnerability_name:
                "Sensitive Cookie Missing HttpOnly Protection Flag Enforcement",
              severity: "High",
              code_snippet: `Set-Cookie script interception variable exposed: ${targetCookie.name}=${targetCookie.value.substring(0, 8)}...; Domain=${targetCookie.domain}`,
            });
          }
        }

        // DEEP SPA INTERACTION (Clicking buttons to trigger React state changes)
        process.stdout.write(
          `[WEB_SCAN_INTERACTION] Probing interactive DOM nodes for Single Page Application state triggers...\n`,
        );
        try {
          const clickables = await page
            .locator('button, [role="button"]')
            .all();
          // Limit to 3 clicks per page to prevent scanning from taking forever
          const maxClicks = Math.min(clickables.length, 3);

          for (let i = 0; i < maxClicks; i++) {
            const element = clickables[i];
            if (element) {
              // We click and wait passively. If it triggers an XHR/GraphQL request, the network interceptor above catches it!
              await element.click({ timeout: 2000 }).catch(() => {});
              await page.waitForTimeout(500); // Give React half a second to mutate state or fire requests
            }
          }
        } catch (interactionErr: any) {
          process.stderr.write(
            `[INTERACTION_SKIP] Minor failure interacting with DOM element nodes: ${interactionErr.message}\n`,
          );
        }

        // MASSIVE DOM & FRAMEWORK STATE EXTRACTION
        process.stdout.write(
          `[WEB_SCAN_DOM_SPIDER] Extracting deep links, web-storage, and React/Next/Vue internal state maps...\n`,
        );
        const frameExtractionResults = await page.evaluate(() => {
          const docGlobal = (globalThis as any).document;
          const locStorageGlobal = (globalThis as any).localStorage;
          const sessStorageGlobal = (globalThis as any).sessionStorage;

          const memoryObjectDump: Record<string, string> = {};
          const frameworkStateDump: string[] = [];

          // 1. Storage API Sweeps
          if (locStorageGlobal) {
            for (let i = 0; i < locStorageGlobal.length; i++) {
              const currentStoreKeyName = locStorageGlobal.key(i);
              if (currentStoreKeyName) {
                memoryObjectDump[`localStorage: ${currentStoreKeyName}`] =
                  locStorageGlobal.getItem(currentStoreKeyName) || "";
              }
            }
          }

          if (sessStorageGlobal) {
            for (let i = 0; i < sessStorageGlobal.length; i++) {
              const currentStoreKeyName = sessStorageGlobal.key(i);
              if (currentStoreKeyName) {
                memoryObjectDump[`sessionStorage: ${currentStoreKeyName}`] =
                  sessStorageGlobal.getItem(currentStoreKeyName) || "";
              }
            }
          }

          // 2. Framework-Specific Hidden State Sweeps (Next.js, Redux, Nuxt)
          const nextData = (globalThis as any).__NEXT_DATA__;
          if (nextData) {
            frameworkStateDump.push(
              `Next.js State Dump: ${JSON.stringify(nextData)}`,
            );
          }

          const reduxStore =
            (globalThis as any).__REDUX_STATE__ || (globalThis as any).store;
          if (reduxStore) {
            frameworkStateDump.push(
              `Redux Global Store Dump: ${JSON.stringify(reduxStore)}`,
            );
          }

          const nuxtData = (globalThis as any).__NUXT__;
          if (nuxtData) {
            frameworkStateDump.push(
              `Nuxt.js State Dump: ${JSON.stringify(nuxtData)}`,
            );
          }

          // 3. Inline Script Sweeps
          let collectedBaseInlineScriptsContent = "";
          if (docGlobal) {
            collectedBaseInlineScriptsContent = Array.from(
              docGlobal.querySelectorAll("script:not([src])"),
            )
              .map((elemNodeItem: any) => elemNodeItem.textContent || "")
              .join("\n");
          }

          // 4. Anchor Link Sweeps for the Crawl Queue
          let extractedAnchorHrefLinksArray: string[] = [];
          if (docGlobal) {
            extractedAnchorHrefLinksArray = Array.from(
              docGlobal.querySelectorAll("a[href]"),
            )
              .map((anchorItemNode: any) => anchorItemNode.href)
              .filter((hrefStrItem: string) => hrefStrItem.trim().length > 0);
          }

          return {
            storage: memoryObjectDump,
            frameworkStates: frameworkStateDump,
            inlineScripts: collectedBaseInlineScriptsContent,
            discoveredLinks: extractedAnchorHrefLinksArray,
          };
        });

        // Evaluate Web Storage
        for (const [keyStoreMapName, valueStoreMapContext] of Object.entries(
          frameExtractionResults.storage,
        )) {
          if (
            /token|jwt|auth|secret/i.test(keyStoreMapName) &&
            valueStoreMapContext.length > 20
          ) {
            findings.push({
              file_path: `Browser Web Storage API [Scanned route location: ${currentUrlToScan}]`,
              vulnerability_name:
                "Sensitive Authentication Data in Web Storage (XSS Token Leakage Risk Mapping)",
              severity: "High",
              code_snippet: `${keyStoreMapName} = "${valueStoreMapContext.substring(0, 50)}..."`,
            });
          }

          for (const rule of WEB_SCAN_RULES) {
            rule.regex.lastIndex = 0;
            if (rule.regex.test(valueStoreMapContext)) {
              findings.push({
                file_path: `Browser Storage Session Variable Runtime Profile Map [Target: ${currentUrlToScan}]`,
                vulnerability_name: `${rule.name} (Exposed context tracked in variable property name: ${keyStoreMapName})`,
                severity: rule.severity,
                code_snippet: `${keyStoreMapName} = "${valueStoreMapContext.substring(0, 100)}..."`,
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
                file_path: `Hidden Framework Hydration State (Next.js/React) [Target: ${currentUrlToScan}]`,
                vulnerability_name: `${rule.name} (Leaked strictly via Framework hydration window objects)`,
                severity: rule.severity,
                code_snippet: `[Object State Dump Matched Signature]`,
              });
            }
          }
        }

        // Evaluate Inline Scripts
        if (frameExtractionResults.inlineScripts.trim().length > 0) {
          for (const rule of WEB_SCAN_RULES) {
            rule.regex.lastIndex = 0;
            if (rule.regex.test(frameExtractionResults.inlineScripts)) {
              findings.push({
                file_path: `${currentUrlToScan} (Inline Dynamic Script Payload Node)`,
                vulnerability_name: `${rule.name} (Embedded in HTML Base)`,
                severity: rule.severity,
                code_snippet:
                  "[Inline Script Context Block Content Traced Match]",
              });
            }
          }
        }

        // Push new links to the Crawl Queue
        for (const linkHrefTargetElement of frameExtractionResults.discoveredLinks) {
          try {
            const tempValidatedUrlInstance = new URL(
              linkHrefTargetElement,
              originTargetRootString,
            );

            if (tempValidatedUrlInstance.origin === originTargetRootString) {
              const fullyCleanedTargetLinkString =
                tempValidatedUrlInstance.href.split("#")[0]!;

              if (
                !visitedUrls.has(fullyCleanedTargetLinkString) &&
                !crawlQueue.includes(fullyCleanedTargetLinkString)
              ) {
                crawlQueue.push(fullyCleanedTargetLinkString);
              }
            }
          } catch (e: any) {
            // Passive escape for mailto or invalid relative routing handles inside DOM structures
          }
        }
      }
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

    // Dedupe: the same secret commonly appears in multiple JS bundles, localStorage, and __NEXT_DATA__
    // simultaneously. Sending each as a separate AI finding wastes tokens. Key by name + first 40 chars
    // of the snippet so identical leaks across surfaces collapse into one finding.
    const dedupedFindings: WebScanFinding[] = [];
    const seenFindingKeys = new Set<string>();
    for (const f of findings) {
      const dedupKey = `${f.vulnerability_name}|${f.code_snippet.substring(0, 40)}`;
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
