//src/components/pages/aiLab/ReportDetails.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useGetReportQuery } from "@/lib/features/ai/gemini/geminiApiSlice";
import { useGetClaudeReportQuery } from "@/lib/features/ai/claude/claudeApiSlice";
import CornerFlourish from "@/components/shared/CornerFlourish";
import VulnerabilityCard from "./VulnerabilityCard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ReportDetailsProps {
  engine: string;
  reportId: string;
}

export default function ReportDetails({
  engine,
  reportId,
}: ReportDetailsProps) {
  const [pollInterval, setPollInterval] = useState<number>(3000);
  const [page, setPage] = useState(1);

  // RTK Query hooks must always be called at the top level.
  // We use the `skip` parameter to completely bypass the hook that doesn't match the current engine.
  // Also expose `error` so we can show polling-network-failure UI instead of hanging on "Scan in progress".
  const {
    data: geminiData,
    isFetching: isGeminiFetching,
    error: geminiError,
  } = useGetReportQuery(
    { reportId, page, limit: 10 },
    {
      pollingInterval: engine === "gemini" ? pollInterval : 0,
      skip: engine !== "gemini",
    },
  );

  const {
    data: claudeData,
    isFetching: isClaudeFetching,
    error: claudeError,
  } = useGetClaudeReportQuery(
    { reportId, page, limit: 10 },
    {
      pollingInterval: engine === "claude" ? pollInterval : 0,
      skip: engine !== "claude",
    },
  );

  // Dynamically assign the active data and fetching states based on the engine
  const reportData = engine === "claude" ? claudeData : geminiData;
  const isFetching = engine === "claude" ? isClaudeFetching : isGeminiFetching;
  const pollingError = engine === "claude" ? claudeError : geminiError;

  const activeReport = reportData?.data?.report;
  const activeFindings = reportData?.data?.findings || [];
  const meta = reportData?.data?.meta;

  const isScanRunning =
    activeReport?.status === "pending" ||
    activeReport?.status === "processing" ||
    (isFetching && !activeReport && !pollingError);

  // Stop polling automatically when the job finishes or crashes
  useEffect(() => {
    if (activeReport) {
      if (
        activeReport.status === "completed" ||
        activeReport.status === "failed"
      ) {
        setPollInterval(0);
      }
    }
  }, [activeReport]);

  // Also stop polling if the poll itself starts erroring out (network drop, 500 from the
  // server). Without this we'd hammer the broken endpoint every 3 seconds forever.
  useEffect(() => {
    if (pollingError) {
      setPollInterval(0);
    }
  }, [pollingError]);

  if (!activeReport && !isFetching && !isScanRunning) {
    return (
      <div className="max-w-6xl mx-auto flex flex-col items-center justify-center pt-20">
        <div className="border-3 border-double border-destructive bg-destructive/10 text-destructive p-6 font-bold text-center">
          Report not found or access denied.
        </div>
        <Button
          variant="outline"
          className=" rounded-none border-3 border-double mt-4"
        >
          <Link href="/ai-lab" className="w-full">
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Button
        variant="outline"
        className=" rounded-none border-3 border-double "
      >
        <Link href="/ai-lab" className="w-full">
          Back to Dashboard
        </Link>
      </Button>
      <div className="relative border-3 border-double p-6 bg-card flex flex-col gap-4">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-top-1 -right-1 rotate-90" />
        <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <div className="flex flex-col md:flex-row md:items-center justify-between border-b-3 border-double pb-4 gap-4">
          <h2 className="text-sm font-bold break-all">
            Audit Report: {reportId}
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={cn(
                "text-[10px] font-bold border-3 border-double px-2 py-1 uppercase",
                engine === "claude"
                  ? "text-orange-500 border-orange-500 bg-orange-500/10"
                  : "text-blue-500 border-blue-500 bg-blue-500/10",
              )}
            >
              ENGINE: {engine}
            </span>
            {activeReport?.ai_model && (
              <span className="text-[10px] font-bold border-3 border-double px-2 py-1 uppercase opacity-80">
                MODEL: {activeReport.ai_model}
              </span>
            )}
            <span
              className={cn(
                "text-xs font-bold border-3 border-double px-3 py-1 w-fit uppercase",
                isScanRunning
                  ? "animate-pulse border-primary text-primary"
                  : activeReport?.status === "failed"
                    ? "border-destructive text-destructive"
                    : "border-primary text-primary",
              )}
            >
              Status: {activeReport?.status || "CONNECTING..."}
            </span>
          </div>
        </div>

        {/* POLLING-ERROR UI: network drop, 500 from /report endpoint, etc.
            Without this the UI would sit on "Scan in progress..." forever. */}
        {pollingError && (
          <div className="border-3 border-double border-destructive p-4 bg-destructive/10 flex flex-col gap-2 mt-2">
            <span className="text-xs font-bold text-destructive uppercase">
              Could not fetch report status
            </span>
            <p className="text-xs font-bold opacity-80">
              {(() => {
                const e = pollingError as any;
                if (e?.status === "FETCH_ERROR")
                  return "Network error — the server is unreachable. Check your connection.";
                if (e?.status === 404)
                  return "Report not found or you don't have access to it.";
                if (e?.status === 401)
                  return "Your session expired. Please log in again.";
                if (typeof e?.status === "number" && e.status >= 500)
                  return `Server returned ${e.status}. The scan may still be running — refresh the page in a minute.`;
                return e?.data?.error || "Unknown error fetching report.";
              })()}
            </p>
            <button
              type="button"
              onClick={() => setPollInterval(3000)}
              className="self-start border-3 border-double px-3 py-1 text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              [ Retry polling ]
            </button>
          </div>
        )}

        {/* POLLING STATE UI */}
        {isScanRunning && (
          <div className="py-16 text-center flex flex-col items-center gap-3">
            <span className="text-xs font-bold opacity-70">
              Scan in progress...{" "}
            </span>
            <span className="text-[10px] font-bold opacity-50 animate-pulse">
              Analyzing target, please wait lil bro...
            </span>
          </div>
        )}

        {/* COMPLETED STATE UI */}
        {!isScanRunning && activeReport?.status === "completed" && (
          <div className="flex flex-col gap-6 pt-2">
            <div className="text-xs font-bold p-4 border-3 border-double bg-background flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <span className="truncate w-full sm:w-[70%]">
                Target: {activeReport.target_url}
              </span>
              <span className="whitespace-nowrap bg-primary text-primary-foreground px-2 py-1 border-3 border-double">
                Anomalies Found: {meta?.totalItems || activeFindings.length}
              </span>
            </div>

            {/* PARTIAL-SUCCESS WARNINGS: scan completed but the engine recorded non-fatal issues */}
            {activeReport.engine_warnings &&
              activeReport.engine_warnings.length > 0 && (
                <div className="border-3 border-double border-yellow-500 p-4 bg-yellow-500/10 flex flex-col gap-2">
                  <span className="text-xs font-bold text-yellow-500 uppercase">
                    Engine Warnings ({activeReport.engine_warnings.length})
                  </span>
                  <ul className="list-disc list-inside text-xs font-bold opacity-80 space-y-1">
                    {activeReport.engine_warnings.map(
                      (warn: string, idx: number) => (
                        <li key={idx}>{warn}</li>
                      ),
                    )}
                  </ul>
                </div>
              )}

            {activeFindings.length === 0 ? (
              <div className="border-3 border-double p-8 text-center text-sm font-bold bg-primary/5 text-primary">
                Zero vulnerabilities detected during static analysis. Secure for
                deployment.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4">
                  {activeFindings.map((finding: any) => (
                    <VulnerabilityCard key={finding.id} finding={finding} />
                  ))}
                </div>

                {/* PAGINATION CONTROLS FOR FINDINGS */}
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
            )}
          </div>
        )}

        {/* FAILED STATE UI */}
        {!isScanRunning && activeReport?.status === "failed" && (
          <div className="border-3 border-double border-destructive p-4 bg-destructive/10 flex flex-col gap-3 mt-2">
            <span className="text-xs font-bold text-destructive">
              Scan Failed{" "}
            </span>
            <ul className="list-disc list-inside text-xs font-bold opacity-80 space-y-1">
              {activeReport.engine_warnings &&
              activeReport.engine_warnings.length > 0 ? (
                activeReport.engine_warnings.map(
                  (warn: string, idx: number) => <li key={idx}>{warn}</li>,
                )
              ) : (
                <li>
                  Background worker crashed or timed out during target
                  resolution.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
