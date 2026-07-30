//src/components/pages/aiLab/repoScanner.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import Link from "next/link";
import { RootState } from "@/lib/store";
import { useScanRepoMutation } from "@/lib/features/ai/gemini/geminiApiSlice";
import { useClaudeScanRepoMutation } from "@/lib/features/ai/claude/claudeApiSlice";
import { repoScanSchema } from "@/lib/features/ai/gemini/geminiSchema";
import { claudeRepoScanSchema } from "@/lib/features/ai/claude/claudeSchema";
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
import { getAiKeyStatus } from "@/lib/features/ai/aiKeyStatus";

export default function RepoScanner() {
  const router = useRouter();

  const [selectedEngine, setSelectedEngine] = useState<"gemini" | "claude">(
    "gemini",
  );
  const [claudeModel, setClaudeModel] =
    useState<ClaudeModelId>(DEFAULT_CLAUDE_MODEL);
  const [geminiModel, setGeminiModel] =
    useState<GeminiModelId>(DEFAULT_GEMINI_MODEL);
  const [targetUrl, setTargetUrl] = useState<string>("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const user = useSelector((state: RootState) => state.auth?.user);

  const keyStatus = getAiKeyStatus(user, selectedEngine);
  const hasPersonalKey =
    selectedEngine === "gemini" ? !!user?.hasGeminiKey : !!user?.hasClaudeKey;
  const canUseSystemKeys =
    user?.has_system_ai_access === true ||
    user?.role === "admin" ||
    user?.role === "super_admin";

  const [scanRepoGemini, { isLoading: isGeminiLoading }] =
    useScanRepoMutation();
  const [scanRepoClaude, { isLoading: isClaudeLoading }] =
    useClaudeScanRepoMutation();

  const isLoading = isGeminiLoading || isClaudeLoading;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const payload = { targetUrl };

    const schemaToUse =
      selectedEngine === "claude" ? claudeRepoScanSchema : repoScanSchema;
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

    try {
      let response;
      if (selectedEngine === "claude") {
        response = await scanRepoClaude({
          ...payload,
          model: claudeModel,
        }).unwrap();
      } else {
        response = await scanRepoGemini({
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
          "Access denied. You do not have permission for this scan.";
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
      message="You must be logged in to access the Git Repository Scanner."
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
            Git Repository Scanner :
          </h1>
          <p className="text-xs font-bold border-l-3 border-double pl-3 mb-6">
            Initialize AST/Regex engine against a remote codebase.
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

            <div className="flex flex-col gap-1 mt-2">
              <label className="text-xs font-bold">Target Repository</label>
              <input
                type="text"
                disabled={isLoading}
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://github.com/..."
                className="w-full bg-background border-3 border-double px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-50 transition-colors"
              />
              {formErrors.targetUrl && (
                <p className="text-destructive font-bold text-xs mt-1">
                  {formErrors.targetUrl}
                </p>
              )}
            </div>

            <div className="mt-2">
              <div
                className={cn(
                  "flex flex-col sm:flex-row items-start sm:items-center justify-between border-3 border-double p-3 gap-2",
                  keyStatus.type === "global-forced" &&
                    "border-orange-500 bg-orange-500/10",
                  keyStatus.type === "personal-active" &&
                    "border-blue-500 bg-blue-500/10",
                  keyStatus.type === "personal-only" &&
                    "border-blue-500 bg-blue-500/10",
                  keyStatus.type === "global-fallback" &&
                    "border-emerald-500 bg-emerald-500/10",
                  keyStatus.type === "restricted" &&
                    "border-destructive bg-destructive/10",
                )}
              >
                <span
                  className={cn(
                    "text-sm font-bold flex items-center gap-2",
                    keyStatus.type === "global-forced" &&
                      "text-orange-600 dark:text-orange-500",
                    (keyStatus.type === "personal-active" ||
                      keyStatus.type === "personal-only") &&
                      "text-blue-600 dark:text-blue-500",
                    keyStatus.type === "global-fallback" &&
                      "text-emerald-600 dark:text-emerald-500",
                    keyStatus.type === "restricted" && "text-destructive",
                  )}
                >
                  {keyStatus.label}
                </span>
                {keyStatus.ctaText && (
                  <Link
                    href="/me"
                    className={cn(
                      "text-xs font-bold hover:underline",
                      keyStatus.type === "global-forced" &&
                        "text-orange-600 dark:text-orange-500",
                      (keyStatus.type === "personal-active" ||
                        keyStatus.type === "personal-only") &&
                        "text-blue-600 dark:text-blue-500",
                      keyStatus.type === "global-fallback" &&
                        "text-emerald-600 dark:text-emerald-500",
                      keyStatus.type === "restricted" && "text-destructive",
                    )}
                  >
                    {keyStatus.ctaText} in settings
                  </Link>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || (!hasPersonalKey && !canUseSystemKeys)}
              className="w-full border-3 border-double bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs py-3 disabled:opacity-50 transition-colors mt-2"
            >
              {isLoading
                ? `Dispatching to ${selectedEngine}...`
                : "Execute Scan"}
            </button>

            {formErrors.global && (
              <div className="border-3 border-double border-destructive bg-destructive/10 text-destructive p-3 text-xs font-bold text-center  animate-in fade-in-50 duration-200">
                {formErrors.global}
              </div>
            )}
          </form>
        </div>
      </div>
    </AuthGuard>
  );
}
