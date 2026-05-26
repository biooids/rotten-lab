//src/components/pages/aiLab/AiDashboard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGetHistoryQuery } from "@/lib/features/ai/gemini/geminiApiSlice";
import { useGetClaudeHistoryQuery } from "@/lib/features/ai/claude/claudeApiSlice";
import CornerFlourish from "@/components/shared/CornerFlourish";
import { cn } from "@/lib/utils";
import Link from "next/link";
import AuthGuard from "@/components/shared/AuthGuard";

export default function AiDashboard() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("all");
  const [filterTime, setFilterTime] = useState("all");

  // NEW: Isolate history fetches by selected AI Engine
  const [filterEngine, setFilterEngine] = useState<"gemini" | "claude">(
    "gemini",
  );

  const queryParams = {
    page,
    limit: 10,
    type: filterType,
    timeframe: filterTime,
  };

  // We call both hooks but use `skip` to only run the one matching the selected engine.
  // Expose `error` so a 500 (DB down) or network drop shows the user a banner instead
  // of an infinite "Loading findings..." spinner.
  const {
    data: geminiHistory,
    isLoading: isGeminiLoading,
    error: geminiError,
  } = useGetHistoryQuery(queryParams, { skip: filterEngine !== "gemini" });

  const {
    data: claudeHistory,
    isLoading: isClaudeLoading,
    error: claudeError,
  } = useGetClaudeHistoryQuery(queryParams, {
    skip: filterEngine !== "claude",
  });

  const historyData = filterEngine === "claude" ? claudeHistory : geminiHistory;
  const isLoading =
    filterEngine === "claude" ? isClaudeLoading : isGeminiLoading;
  const historyError = filterEngine === "claude" ? claudeError : geminiError;
  const meta = historyData?.meta;

  const handleFilterChange = (
    setter: React.Dispatch<React.SetStateAction<any>>,
    value: string,
  ) => {
    setter(value);
    setPage(1);
  };

  return (
    <AuthGuard
      message="You must be logged in to view this page."
      level="critical"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* HEADER & ACTIONS */}
        <div className="relative border-3 border-double p-6 bg-card flex flex-col gap-6">
          <CornerFlourish className="-top-1 -left-1" />
          <CornerFlourish className="-top-1 -right-1 rotate-90" />
          <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
          <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

          <div>
            <h1 className="bg-primary text-primary-foreground font-bold p-1 w-fit mb-2 ">
              Vulnerability Scanners{" "}
            </h1>
            <p className="text-xs font-bold border-l-3 border-double pl-3">
              Select a tool to start a new scan, or view your history below.
            </p>
          </div>

          {/* EQUAL WEIGHT NAVIGATION BUTTONS */}
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <Link
              href="/ai-lab/scan/web"
              className="group flex-1 border-3 border-double bg-background text-foreground text-center py-3 text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-all flex items-center justify-center gap-2"
            >
              <span>Scan Web</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                &rarr;
              </span>
            </Link>

            <Link
              href="/ai-lab/scan/repo"
              className="group flex-1 border-3 border-double bg-background text-foreground text-center py-3 text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-all flex items-center justify-center gap-2"
            >
              <span>Scan Repo</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                &rarr;
              </span>
            </Link>
          </div>
        </div>

        {/* HISTORY LIST WITH FILTERS */}
        <div className="relative border-3 border-double p-6 bg-card flex flex-col gap-4">
          {/* FILTER BAR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-3 border-double pb-4 gap-4">
            <h2 className="text-sm font-bold ">Scan History</h2>
            <div className="flex flex-wrap gap-2">
              <select
                value={filterEngine}
                onChange={(e) =>
                  handleFilterChange(setFilterEngine, e.target.value)
                }
                className={cn(
                  "bg-background border-3 border-double px-2 py-1 text-xs font-bold outline-none cursor-pointer",
                  filterEngine === "claude"
                    ? "text-orange-500 border-orange-500"
                    : "text-blue-500 border-blue-500",
                )}
              >
                <option value="gemini">ENGINE: GEMINI</option>
                <option value="claude">ENGINE: CLAUDE</option>
              </select>
              <select
                value={filterType}
                onChange={(e) =>
                  handleFilterChange(setFilterType, e.target.value)
                }
                className="bg-background border-3 border-double px-2 py-1 text-xs font-bold outline-none focus:border-primary cursor-pointer"
              >
                <option value="all">ALL TARGETS</option>
                <option value="url">WEB SCANS</option>
                <option value="repo">REPO SCANS</option>
              </select>
              <select
                value={filterTime}
                onChange={(e) =>
                  handleFilterChange(setFilterTime, e.target.value)
                }
                className="bg-background border-3 border-double px-2 py-1 text-xs font-bold outline-none focus:border-primary cursor-pointer"
              >
                <option value="all">ALL TIME</option>
                <option value="1d">PAST 24H</option>
                <option value="3d">PAST 3 DAYS</option>
                <option value="1w">PAST WEEK</option>
                <option value="1m">PAST MONTH</option>
                <option value="2m">PAST 2 MONTHS</option>
              </select>
            </div>
          </div>

          {historyError ? (
            <div className="border-3 border-double border-destructive p-4 bg-destructive/10 flex flex-col gap-2">
              <span className="text-xs font-bold text-destructive uppercase">
                Could not load scan history
              </span>
              <p className="text-xs font-bold opacity-80">
                {(() => {
                  const e = historyError as any;
                  if (e?.status === "FETCH_ERROR")
                    return "Network error — the server is unreachable. Check your connection.";
                  if (e?.status === 401)
                    return "Your session expired. Please log in again.";
                  if (typeof e?.status === "number" && e.status >= 500)
                    return `Server returned ${e.status}. The history database may be down — try again in a minute.`;
                  return e?.data?.error || "Unknown error fetching history.";
                })()}
              </p>
            </div>
          ) : isLoading ? (
            <div className="text-xs font-bold p-4 text-center animate-pulse">
              Loading findings...
            </div>
          ) : historyData?.data && historyData.data.length > 0 ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3">
                {historyData.data.map((report: any) => {
                  const activeEngine = report.ai_provider || "gemini";

                  return (
                    <button
                      key={report.id}
                      onClick={() =>
                        router.push(
                          `/ai-lab/report/${activeEngine}/${report.id}`,
                        )
                      }
                      className="group border-3 border-double p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-muted hover:border-primary transition-all text-left w-full cursor-pointer"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "text-[9px] font-bold border-3 border-double px-1.5 py-0.5 uppercase",
                              activeEngine === "claude"
                                ? "text-orange-500 border-orange-500"
                                : "text-blue-500 border-blue-500",
                            )}
                          >
                            {activeEngine}
                          </span>
                          {report.ai_model && (
                            <span className="text-[9px] font-bold border-3 border-double px-1.5 py-0.5 uppercase opacity-70">
                              {report.ai_model}
                            </span>
                          )}
                          <span className="text-xs font-bold truncate max-w-[200px] sm:max-w-xs group-hover:text-primary transition-colors">
                            {report.target_url}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold opacity-70">
                          {new Date(report.created_at).toLocaleString()} | Type:{" "}
                          {report.scan_type}
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        <span
                          className={cn(
                            "text-[10px] font-bold  border-3 border-double px-2 py-1",
                            report.status === "failed"
                              ? "text-destructive border-destructive"
                              : report.status === "completed"
                                ? "text-primary border-primary"
                                : "text-primary border-primary animate-pulse",
                          )}
                        >
                          {report.status}
                        </span>

                        <span className="text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-x-2 group-hover:translate-x-0 hidden sm:block whitespace-nowrap">
                          [ VIEW ] &rarr;
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* PAGINATION CONTROLS */}
              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between border-t-3 border-double pt-4 mt-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="border-3 border-double px-3 py-1 text-xs font-bold hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground transition-colors"
                  >
                    [ &lt; PREV ]
                  </button>
                  <span className="text-xs font-bold">
                    PAGE {meta.currentPage} OF {meta.totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(meta.totalPages, p + 1))
                    }
                    disabled={page === meta.totalPages}
                    className="border-3 border-double px-3 py-1 text-xs font-bold hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground transition-colors"
                  >
                    [ NEXT &gt; ]
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs font-bold p-4 text-center border-3 border-double opacity-70">
              No historical records found for these filters.
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
