"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  useGetReportQuery,
  useDownloadGeminiReportPdfMutation,
} from "@/lib/features/ai/gemini/geminiApiSlice";
import {
  useGetClaudeReportQuery,
  useDownloadClaudeReportPdfMutation,
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

  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [downloadErrorMsg, setDownloadErrorMsg] = useState("");

  const [downloadGeminiPdf, { isLoading: isGeminiPdfLoading }] =
    useDownloadGeminiReportPdfMutation();
  const [downloadClaudePdf, { isLoading: isClaudePdfLoading }] =
    useDownloadClaudeReportPdfMutation();
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
        activeReport.status === "failed"
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

      const extractedMessage =
        error?.message ||
        error?.data?.error ||
        error?.data?.message ||
        "An unknown error occurred while downloading.";
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
                "text-[10px] font-bold border-3 border-double px-2 py-1 ",
                engine === "claude"
                  ? "text-orange-500 border-orange-500 bg-orange-500/10"
                  : "text-blue-500 border-blue-500 bg-blue-500/10",
              )}
            >
              ENGINE: {engine}
            </span>
            {activeReport?.ai_model && (
              <span className="text-[10px] font-bold border-3 border-double px-2 py-1  opacity-80">
                MODEL: {activeReport.ai_model}
              </span>
            )}
            <span
              className={cn(
                "text-xs font-bold border-3 border-double px-3 py-1 w-fit ",
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
              [ Retry polling ]
            </button>
          </div>
        )}

        {isScanRunning && (
          <div className="flex flex-col gap-4">
            <FunFactLoader
              engine={engine}
              title={
                (activeReport?.total_chunks ?? 0) > 0
                  ? `Analyzing code... (Processed Chunk ${activeReport?.completed_chunks ?? 0} of ${activeReport?.total_chunks ?? 0})`
                  : "Resolving target and generating AST payload..."
              }
            />

            {/* The 60-Second Sleep Indicator */}
            {(activeReport?.total_chunks ?? 0) >
              (activeReport?.completed_chunks ?? 0) && (
              <div className="border-3 border-double border-primary text-primary bg-primary/10 p-4 text-xs font-bold text-center animate-pulse flex flex-col gap-1">
                <span>[ AI ENGINE RATE LIMIT PROTOCOL ACTIVE ]</span>
                <span className="opacity-80">
                  Processing chunk {(activeReport?.completed_chunks ?? 0) + 1}.
                  The AI thread will sleep for 60 seconds between chunks to
                  bypass free-tier rate limits. Do not close this page.
                </span>
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
                    Anomalies Found: {meta?.totalItems || activeFindings.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isPdfLoading}
                    className="whitespace-nowrap border-3 border-double px-3 py-1 hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground transition-colors cursor-pointer"
                  >
                    {isPdfLoading ? "[ DOWNLOADING... ]" : "[ DOWNLOAD PDF ]"}
                  </button>
                </div>

                {downloadStatus === "success" && (
                  <div className="text-[10px] font-bold border-3 border-double border-primary text-primary bg-primary/10 px-2 py-1">
                    [ SUCCESS ] PDF downloaded securely.
                  </div>
                )}
                {downloadStatus === "error" && (
                  <div className="text-[10px] font-bold border-3 border-double border-destructive text-destructive bg-destructive/10 px-2 py-1 flex flex-col text-right">
                    <span>[ FAILED ] Could not download PDF.</span>
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
              <div className="border-3 border-double p-8 text-center text-sm font-bold bg-primary/5 text-primary">
                Zero vulnerabilities detected during static analysis. Secure for
                deployment.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4">
                  {activeFindings.map((finding: any) => (
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
