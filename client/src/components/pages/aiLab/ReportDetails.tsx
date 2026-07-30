//src/components/pages/aiLab/ReportDetails.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  useGetReportQuery,
  useDownloadGeminiReportPdfMutation,
  useCancelGeminiScanMutation, // <--- ADDED
} from "@/lib/features/ai/gemini/geminiApiSlice";
import {
  useGetClaudeReportQuery,
  useDownloadClaudeReportPdfMutation,
  useCancelClaudeScanMutation, // <--- ADDED
} from "@/lib/features/ai/claude/claudeApiSlice";
import { triggerFileDownload } from "@/lib/features/ai/downloadHelper";
import CornerFlourish from "@/components/shared/CornerFlourish";
import VulnerabilityCard from "./VulnerabilityCard";
import FunFactLoader from "@/components/shared/FunFactLoader";
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
  const [now, setNow] = useState<number>(Date.now());
  const [groupSimilar, setGroupSimilar] = useState<boolean>(false);

  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [downloadErrorMsg, setDownloadErrorMsg] = useState("");

  const [downloadGeminiPdf, { isLoading: isGeminiPdfLoading }] =
    useDownloadGeminiReportPdfMutation();
  const [downloadClaudePdf, { isLoading: isClaudePdfLoading }] =
    useDownloadClaudeReportPdfMutation();

  // <--- ADDED START: Cancel Mutations
  const [cancelGeminiScan, { isLoading: isCancellingGemini }] =
    useCancelGeminiScanMutation();
  const [cancelClaudeScan, { isLoading: isCancellingClaude }] =
    useCancelClaudeScanMutation();
  const isCancelling = isCancellingGemini || isCancellingClaude;
  // <--- ADDED END

  const isPdfLoading = isGeminiPdfLoading || isClaudePdfLoading;

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

  useEffect(() => {
    if (activeReport) {
      if (
        activeReport.status === "completed" ||
        activeReport.status === "failed" ||
        activeReport.status === "cancelled" // <--- ADDED: Stop polling if cancelled
      ) {
        setPollInterval(0);
      }
    }
  }, [activeReport]);

  useEffect(() => {
    if (pollingError) {
      setPollInterval(0);
    }
  }, [pollingError]);

  useEffect(() => {
    if (!isScanRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isScanRunning]);

  // <--- ADDED START: Cancel Handler
  const handleCancelScan = async () => {
    if (
      !window.confirm(
        "Are you sure you want to abort this scan? This cannot be undone.",
      )
    )
      return;
    try {
      if (engine === "claude") {
        await cancelClaudeScan(reportId).unwrap();
      } else {
        await cancelGeminiScan(reportId).unwrap();
      }
    } catch (err: any) {
      console.error("Failed to cancel scan:", err);
      alert(err?.data?.error || err?.message || "Failed to cancel the scan.");
    }
  };
  // <--- ADDED END

  const totalChunks = activeReport?.total_chunks || 0;
  const completedChunks = activeReport?.completed_chunks || 0;
  const remainingChunks = Math.max(0, totalChunks - completedChunks);

  const updatedAtTime = activeReport?.updated_at
    ? new Date(activeReport.updated_at).getTime()
    : now;

  const secondsSinceUpdate = Math.max(
    0,
    Math.floor((now - updatedAtTime) / 1000),
  );

  const isRetrying = secondsSinceUpdate > 85;

  const estimatedSecondsLeft = Math.max(
    0,
    remainingChunks * 76 - secondsSinceUpdate,
  );
  const displayMinutes = Math.floor(estimatedSecondsLeft / 60);
  const displaySeconds = estimatedSecondsLeft % 60;

  const displayedFindings = useMemo(() => {
    if (!groupSimilar || !activeFindings || activeFindings.length === 0) {
      return activeFindings;
    }

    const groupedMap = new Map();

    activeFindings.forEach((finding: any) => {
      const key = finding.vulnerability_name;

      if (groupedMap.has(key)) {
        const existing = groupedMap.get(key);

        const existingPath = existing.file_path || "";
        const newPath = finding.file_path || "";

        if (!existingPath.includes(newPath)) {
          existing.file_path = existingPath
            ? `${existingPath}, ${newPath}`
            : newPath;
        }
      } else {
        groupedMap.set(key, { ...finding });
      }
    });

    return Array.from(groupedMap.values());
  }, [activeFindings, groupSimilar]);

  const handleDownloadPdf = async () => {
    setDownloadStatus("idle");
    setDownloadErrorMsg("");

    try {
      let blob: Blob;
      if (engine === "claude") {
        blob = await downloadClaudePdf(reportId).unwrap();
      } else {
        blob = await downloadGeminiPdf(reportId).unwrap();
      }

      if (blob.type === "application/json") {
        const text = await blob.text();
        const json = JSON.parse(text);
        throw new Error(
          json.error ||
            json.message ||
            "The server rejected the PDF generation request.",
        );
      }

      triggerFileDownload(blob, `${engine}_audit_${reportId}.pdf`);

      setDownloadStatus("success");
      setTimeout(() => setDownloadStatus("idle"), 5000);
    } catch (error: any) {
      console.error("Failed to download PDF:", error);
      setDownloadStatus("error");

      let extractedMessage = "An unknown error occurred while downloading.";

      // Parse JSON errors that RTK Query mistakenly wrapped in a Blob
      if (
        error?.data instanceof Blob &&
        error.data.type === "application/json"
      ) {
        try {
          const text = await error.data.text();
          const json = JSON.parse(text);
          extractedMessage = json.error || json.message || extractedMessage;
        } catch (parseErr) {
          // Fallback to default if parsing fails
        }
      } else {
        extractedMessage =
          error?.message ||
          error?.data?.error ||
          error?.data?.message ||
          extractedMessage;
      }

      setDownloadErrorMsg(extractedMessage);
    }
  };

  if (!activeReport && !isFetching && !isScanRunning) {
    return (
      <div className="max-w-6xl mx-auto flex flex-col items-center justify-center pt-20">
        <div className="border-3 border-double border-destructive bg-destructive/10 text-destructive p-6 font-bold text-center">
          Report not found or access denied.
        </div>
        <Button
          variant="outline"
          className="rounded-none border-3 border-double mt-4"
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
      <Button variant="outline" className="rounded-none border-3 border-double">
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
                "text-sm font-bold border-3 border-double px-2 py-1 ",
                engine === "claude"
                  ? "text-orange-500 border-orange-500 bg-orange-500/10"
                  : "text-blue-500 border-blue-500 bg-blue-500/10",
              )}
            >
              Engine: {engine}
            </span>
            {activeReport?.ai_model && (
              <span className="text-sm font-bold border-3 border-double px-2 py-1  opacity-80">
                Model: {activeReport.ai_model}
              </span>
            )}

            {activeReport?.key_type && (
              <span className="text-sm font-bold border-3 border-double px-2 py-1 opacity-80">
                Key:{" "}
                {activeReport.key_type === "personal" ? "Personal" : "Global"}
              </span>
            )}
            <span
              className={cn(
                "text-xs font-bold border-3 border-double px-3 py-1 w-fit ",
                isScanRunning
                  ? "animate-pulse border-primary text-primary"
                  : activeReport?.status === "failed"
                    ? "border-destructive text-destructive"
                    : activeReport?.status === "cancelled" // <--- ADDED: Neutral styling for cancelled
                      ? "border-muted-foreground text-muted-foreground"
                      : "border-primary text-primary",
              )}
            >
              Status: {activeReport?.status || "Connecting..."}
            </span>
          </div>
        </div>

        {pollingError && (
          <div className="border-3 border-double border-destructive p-4 bg-destructive/10 flex flex-col gap-2 mt-2">
            <span className="text-xs font-bold text-destructive ">
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
              Retry
            </button>
          </div>
        )}

        {isScanRunning && (
          <div className="flex flex-col gap-4">
            <FunFactLoader
              engine={engine}
              title={
                totalChunks > 0
                  ? `Analyzing code... (Processed Chunk ${completedChunks} of ${totalChunks})`
                  : "Preparing scan..."
              }
            />

            {totalChunks > 0 && remainingChunks > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold border-3 border-double p-3 bg-background">
                  <span>Estimated Time Remaining:</span>
                  <span
                    className={cn(
                      isRetrying
                        ? "text-yellow-500 animate-pulse"
                        : "text-primary",
                    )}
                  >
                    {estimatedSecondsLeft > 0
                      ? `~${displayMinutes}m ${displaySeconds}s`
                      : "Finalizing execution..."}
                  </span>
                </div>

                {/* DYNAMIC BACKEND STATE INDICATOR */}
                {isRetrying ? (
                  <div className="border-3 border-double border-yellow-500 text-yellow-500 bg-yellow-500/10 p-4 text-xs font-bold animate-pulse flex flex-col gap-1">
                    <span>Connection Delayed / Retrying</span>
                    <span className="opacity-80">
                      The AI provider is taking longer to respond than expected.
                      Our server is automatically retrying. Please keep this
                      page open.
                    </span>
                    <span className="opacity-60 mt-2 font-mono text-sm">
                      Time elapsed on current chunk: {secondsSinceUpdate}s
                    </span>
                  </div>
                ) : (
                  <div className="border-3 border-double border-primary text-primary bg-primary/10 p-4 text-xs font-bold text-center flex flex-col gap-1">
                    <span>Rate Limit Pause</span>
                    <span className="opacity-80">
                      Processing chunk {completedChunks + 1}. The scanner pauses
                      for about 60 seconds between chunks to comply with AI rate
                      limits.
                    </span>
                  </div>
                )}

                {/* <--- ADDED START: CANCEL BUTTON */}
                <div className="flex justify-end border-t-3 border-double border-foreground/10 pt-3 mt-1">
                  <button
                    type="button"
                    onClick={handleCancelScan}
                    disabled={isCancelling}
                    className="border-3 border-double border-destructive text-destructive px-4 py-2 text-xs font-bold hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    Button{" "}
                    {isCancelling ? "Cancelling..." : "[ X ] Cancel Scan"}
                  </button>
                </div>
                {/* <--- ADDED END */}
              </div>
            )}
          </div>
        )}

        {!isScanRunning && activeReport?.status === "completed" && (
          <div className="flex flex-col gap-6 pt-2">
            <div className="text-xs font-bold p-4 border-3 border-double bg-background flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <span className="truncate w-full sm:w-[70%]">
                Target: {activeReport.target_url}
              </span>

              <div className="flex flex-col gap-2 items-end">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="whitespace-nowrap bg-primary text-primary-foreground px-2 py-1 border-3 border-double">
                    Vulnerabilities Found:{" "}
                    {meta?.totalItems || activeFindings.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isPdfLoading}
                    className="whitespace-nowrap border-3 border-double px-3 py-1 hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground transition-colors cursor-pointer"
                  >
                    {isPdfLoading ? "Downloading..." : "Download PDF"}
                  </button>
                </div>

                {downloadStatus === "success" && (
                  <div className="text-sm font-bold border-3 border-double border-primary text-primary bg-primary/10 px-2 py-1">
                    PDF downloaded successfully.
                  </div>
                )}
                {downloadStatus === "error" && (
                  <div className="text-sm font-bold border-3 border-double border-destructive text-destructive bg-destructive/10 px-2 py-1 flex flex-col text-right">
                    <span>Failed to download PDF.</span>
                    <span className="opacity-80">{downloadErrorMsg}</span>
                  </div>
                )}
              </div>
            </div>

            {activeReport.engine_warnings &&
              activeReport.engine_warnings.length > 0 && (
                <div className="border-3 border-double border-yellow-500 p-4 bg-yellow-500/10 flex flex-col gap-2">
                  <span className="text-xs font-bold text-yellow-500 ">
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
              <div className="border-3 border-double p-8 text-center text-sm font-bold bg-primary/5 text-primary flex flex-col gap-2">
                <span>No vulnerabilities detected during the scan.</span>
                {/* <--- ADDED START: Display 0-finding status message */}
                {activeReport?.status_message && (
                  <span className="opacity-80 text-xs block mt-2">
                    Backend Log: {activeReport.status_message}
                  </span>
                )}
                {/* <--- ADDED END */}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* NEW: GROUPING TOGGLE BAR */}
                <div className="flex items-center justify-between border-3 border-double bg-background p-3">
                  <span className="text-xs font-bold">View Mode:</span>
                  <button
                    onClick={() => setGroupSimilar(!groupSimilar)}
                    className={cn(
                      "border-3 border-double px-3 py-1 text-xs font-bold transition-colors",
                      groupSimilar
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-primary hover:text-primary-foreground",
                    )}
                  >
                    {groupSimilar ? "Grouped by Type" : "Raw Findings"}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {/* Map over the new displayedFindings array instead of activeFindings */}
                  {displayedFindings.map((finding: any) => (
                    <VulnerabilityCard
                      key={finding.id}
                      finding={finding}
                      reportId={reportId}
                      engine={engine}
                    />
                  ))}
                </div>

                {meta && meta.totalPages > 1 && (
                  <div className="flex items-center justify-between border-t-3 border-double pt-4 mt-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="border-3 border-double px-3 py-1 text-xs font-bold hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-bold">
                      Page {meta.currentPage} of {meta.totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(meta.totalPages, p + 1))
                      }
                      disabled={page === meta.totalPages}
                      className="border-3 border-double px-3 py-1 text-xs font-bold hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!isScanRunning && activeReport?.status === "failed" && (
          <div className="border-3 border-double border-destructive p-4 bg-destructive/10 flex flex-col gap-3 mt-2">
            <span className="text-xs font-bold text-destructive">
              Scan Failed{" "}
            </span>

            {/* <--- ADDED START: DISPLAY EXACT CRASH LOG */}
            {activeReport?.status_message && (
              <div className="text-sm font-bold opacity-90 border-l-2 border-destructive pl-3 py-1">
                {activeReport.status_message}
              </div>
            )}
            {/* <--- ADDED END */}

            <ul className="list-disc list-inside text-xs font-bold opacity-80 space-y-1">
              {activeReport.engine_warnings &&
              activeReport.engine_warnings.length > 0 ? (
                activeReport.engine_warnings.map(
                  (warn: string, idx: number) => <li key={idx}>{warn}</li>,
                )
              ) : (
                <li>
                  The scanner crashed or timed out while fetching the target.
                </li>
              )}
            </ul>
          </div>
        )}

        {!isScanRunning && activeReport?.status === "cancelled" && (
          <div className="border-3 border-double border-muted-foreground p-4 bg-muted/20 flex flex-col gap-3 mt-2">
            <span className="text-xs font-bold text-muted-foreground">
              Scan Cancelled
            </span>
            {activeReport?.status_message && (
              <div className="text-sm font-bold opacity-90 border-l-2 border-muted-foreground pl-3 py-1">
                {activeReport.status_message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
