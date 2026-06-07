//src/components/pages/aiLab/WebScanner.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import Link from "next/link";
import { RootState } from "@/lib/store";
import { useScanUrlMutation } from "@/lib/features/ai/gemini/geminiApiSlice";
import { useClaudeScanUrlMutation } from "@/lib/features/ai/claude/claudeApiSlice";
import { urlScanSchema } from "@/lib/features/ai/gemini/geminiSchema";
import { claudeUrlScanSchema } from "@/lib/features/ai/claude/claudeSchema";
import {
  DEFAULT_CLAUDE_MODEL,
  type ClaudeModelId,
} from "@/lib/features/ai/claude/claudeTypes";
import {
  DEFAULT_GEMINI_MODEL,
  type GeminiModelId,
} from "@/lib/features/ai/gemini/geminiTypes";
import CornerFlourish from "@/components/shared/CornerFlourish";
import ClaudeModelPicker from "./ClaudeModelPicker";
import GeminiModelPicker from "./GeminiModelPicker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AuthGuard from "@/components/shared/AuthGuard";

export default function WebScanner() {
  const router = useRouter();

  const [selectedEngine, setSelectedEngine] = useState<"gemini" | "claude">(
    "gemini",
  );
  const [claudeModel, setClaudeModel] =
    useState<ClaudeModelId>(DEFAULT_CLAUDE_MODEL);
  const [geminiModel, setGeminiModel] =
    useState<GeminiModelId>(DEFAULT_GEMINI_MODEL);
  const [targetUrl, setTargetUrl] = useState<string>("");
  const [secretAccessKey, setSecretAccessKey] = useState<string>("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const user = useSelector((state: RootState) => state.auth?.user);
  const isAdminBypassed =
    user?.role === "admin" || user?.role === "super_admin";

  const isMissingKey =
    !isAdminBypassed &&
    ((selectedEngine === "gemini" && !user?.hasGeminiKey) ||
      (selectedEngine === "claude" && !user?.hasClaudeKey));

  const [scanGeminiUrl, { isLoading: isGeminiLoading }] = useScanUrlMutation();
  const [scanClaudeUrl, { isLoading: isClaudeLoading }] =
    useClaudeScanUrlMutation();

  const isLoading = isGeminiLoading || isClaudeLoading;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    if (isMissingKey) return;

    const payload = { targetUrl, secretAccessKey };

    const schemaToUse =
      selectedEngine === "claude" ? claudeUrlScanSchema : urlScanSchema;
    const validationResult = schemaToUse.safeParse(payload);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validationResult.error.issues) {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      }
      setFormErrors(fieldErrors);
      return;
    }

    if (
      !isAdminBypassed &&
      (!secretAccessKey || secretAccessKey.trim() === "")
    ) {
      setFormErrors({
        secretAccessKey: "Standard accounts require a valid Portfolio Key.",
      });
      return;
    }

    try {
      let response;
      if (selectedEngine === "claude") {
        response = await scanClaudeUrl({
          ...payload,
          model: claudeModel,
        }).unwrap();
      } else {
        response = await scanGeminiUrl({
          ...payload,
          model: geminiModel,
        }).unwrap();
      }

      router.push(`/ai-lab/report/${selectedEngine}/${response.reportId}`);
    } catch (err: any) {
      let global: string;
      if (err?.status === "FETCH_ERROR" || err?.status === undefined) {
        global = "Couldn't reach the server. Check your connection and retry.";
      } else if (err?.status === 401) {
        global = "Your session expired. Please log in again.";
      } else if (err?.status === 403) {
        global =
          err?.data?.error ||
          "Access denied. A valid Portfolio Key is required for this scan.";
      } else if (err?.status === 400) {
        global =
          err?.data?.error ||
          "The server rejected the scan request as invalid.";
      } else if (typeof err?.status === "number" && err.status >= 500) {
        global =
          err?.data?.error ||
          `Server error (${err.status}). The scan engine may be down — try again in a minute.`;
      } else {
        global = err?.data?.error || "Scan dispatch failed.";
      }
      setFormErrors({ global });
    }
  };

  return (
    <AuthGuard
      message="You must be logged in to access the Web Vulnerability Scanner."
      level="warning"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <Button
          variant="outline"
          className=" rounded-none border-3 border-double "
        >
          <Link href="/ai-lab" className="w-full">
            Back to Dashboard
          </Link>
        </Button>

        <div className="relative border-3 border-double p-6 bg-card">
          <CornerFlourish className="-top-1 -left-1" />
          <CornerFlourish className="-top-1 -right-1 rotate-90" />
          <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
          <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

          <h1 className="bg-primary text-primary-foreground font-bold p-1 w-fit mb-2">
            Web Vulnerability Scanner :
          </h1>
          <p className="text-xs font-bold border-l-3 border-double pl-3 mb-6">
            Enter a website URL to scan for vulnerabilities.
          </p>

          <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
            <div
              style={{ display: "none", opacity: 0, position: "absolute" }}
              aria-hidden="true"
            >
              <input
                type="text"
                name="prevent_autofill_user"
                tabIndex={-1}
                autoComplete="username"
              />
              <input
                type="password"
                name="prevent_autofill_pwd"
                tabIndex={-1}
                autoComplete="current-password"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold">
                Select AI Processing Engine
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEngine("gemini")}
                  disabled={isLoading}
                  className={cn(
                    "flex-1 border-3 border-double py-2 text-xs font-bold transition-all",
                    selectedEngine === "gemini"
                      ? "bg-blue-500/10 border-blue-500 text-blue-500"
                      : "bg-background text-foreground opacity-60 hover:opacity-100 hover:border-primary",
                  )}
                >
                  Gemini
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEngine("claude")}
                  disabled={isLoading}
                  className={cn(
                    "flex-1 border-3 border-double py-2 text-xs font-bold transition-all",
                    selectedEngine === "claude"
                      ? "bg-orange-500/10 border-orange-500 text-orange-500"
                      : "bg-background text-foreground opacity-60 hover:opacity-100 hover:border-primary",
                  )}
                >
                  Claude
                </button>
              </div>
            </div>

            {/* ADDED: Admin/Super Admin Telemetry Posture Ribbon */}
            {isAdminBypassed && (
              <div className="border-3 border-double border-primary/30 bg-primary/5 p-2 text-[11px] font-bold flex flex-wrap justify-between items-center gap-2">
                <span className="text-primary uppercase">
                  [ SECURITY BYPASS CONTROL ]
                </span>
                <div className="flex gap-4">
                  <span>
                    ACCESS SHIELD:{" "}
                    <strong className="text-emerald-500">[ BYPASSED ]</strong>
                  </span>
                  <span>
                    CREDENTIAL FLIGHT:{" "}
                    {selectedEngine === "gemini" ? (
                      user?.hasGeminiKey ? (
                        <strong className="text-blue-500">
                          [ PERSONAL BYOK ]
                        </strong>
                      ) : (
                        <strong className="text-amber-500">
                          [ CORE SERVER ENV fallback ]
                        </strong>
                      )
                    ) : user?.hasClaudeKey ? (
                      <strong className="text-orange-500">
                        [ PERSONAL BYOK ]
                      </strong>
                    ) : (
                      <strong className="text-amber-500">
                        [ CORE SERVER ENV fallback ]
                      </strong>
                    )}
                  </span>
                </div>
              </div>
            )}

            {selectedEngine === "claude" && (
              <ClaudeModelPicker
                value={claudeModel}
                onChange={setClaudeModel}
                disabled={isLoading}
              />
            )}

            {selectedEngine === "gemini" && (
              <GeminiModelPicker
                value={geminiModel}
                onChange={setGeminiModel}
                disabled={isLoading}
              />
            )}

            <div className="flex flex-col md:flex-row gap-4 mt-2">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs font-bold">Target URL</label>
                <input
                  type="text"
                  disabled={isLoading}
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-background border-3 border-double px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-50"
                />
                {formErrors.targetUrl && (
                  <p className="text-destructive font-bold text-xs mt-1">
                    {formErrors.targetUrl}
                  </p>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs font-bold">
                  {isAdminBypassed ? "Bypass Token" : "Access Key"}
                </label>
                <input
                  type="password"
                  disabled={isLoading || isAdminBypassed}
                  value={isAdminBypassed ? "" : secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  placeholder={isAdminBypassed ? "Admin Bypassed" : "Required"}
                  className="w-full bg-background border-3 border-double px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-50"
                />
                {formErrors.secretAccessKey && (
                  <p className="text-destructive font-bold text-xs mt-1">
                    {formErrors.secretAccessKey}
                  </p>
                )}
              </div>
            </div>

            {isMissingKey && (
              <div className="border-3 border-double border-destructive bg-destructive/10 text-destructive p-4 text-xs font-bold flex flex-col items-center gap-2 text-center mt-2">
                <span className="uppercase">
                  [ SYSTEM LOCK ] Missing API Key for {selectedEngine}
                </span>
                <span className="opacity-80">
                  You must configure a valid{" "}
                  {selectedEngine === "gemini"
                    ? "Google Gemini"
                    : "Anthropic Claude"}{" "}
                  API key to perform this scan.
                </span>
                {/* MODIFIED: Updated path to point precisely to '/me' avoiding 404 router issues */}
                <Link
                  href="/me"
                  className="border-3 border-double border-destructive px-4 py-2 hover:bg-destructive hover:text-destructive-foreground transition-colors mt-2 uppercase"
                >
                  Configure in Account Settings
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || isMissingKey}
              className="w-full border-3 border-double bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs py-3 disabled:opacity-50 transition-colors mt-2"
            >
              {isLoading
                ? `Dispatching to ${selectedEngine.toUpperCase()}...`
                : "Start Scan"}
            </button>

            {formErrors.global && (
              <div className="border-3 border-double border-destructive bg-destructive/10 text-destructive p-3 text-xs font-bold text-center">
                {formErrors.global}
              </div>
            )}
          </form>
        </div>
      </div>
    </AuthGuard>
  );
}
