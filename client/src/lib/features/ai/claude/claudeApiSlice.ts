//src/lib/features/ai/claude/claudeApiSlice.ts
import { createApi } from "@reduxjs/toolkit/query/react";
import {
  ScanRequestDTO,
  InitScanResponse,
  ScanResponse,
  ScanHistoryResponse,
  HistoryQueryParams,
  ReportQueryParams,
  ChatHistoryResponse,
  ReportChatSession,
} from "./claudeTypes";
import { baseQueryWithReauth } from "@/lib/api/baseQueryWithReauth";

export const claudeApiSlice = createApi({
  reducerPath: "claudeApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["ClaudeScan", "ClaudeHistory", "ClaudeChat"],
  endpoints: (builder) => ({
    claudeScanUrl: builder.mutation<InitScanResponse, ScanRequestDTO>({
      query: (scanData) => ({
        url: "/ai/claude/scan-url",
        method: "POST",
        body: scanData,
      }),
      invalidatesTags: ["ClaudeHistory"],
    }),

    claudeScanRepo: builder.mutation<InitScanResponse, ScanRequestDTO>({
      query: (scanData) => ({
        url: "/ai/claude/scan-repo",
        method: "POST",
        body: scanData,
      }),
      invalidatesTags: ["ClaudeHistory"],
    }),

    getClaudeHistory: builder.query<
      ScanHistoryResponse,
      HistoryQueryParams | void
    >({
      query: (params) => {
        if (!params) return "/ai/claude/history";
        const {
          page = 1,
          limit = 10,
          type = "all",
          timeframe = "all",
        } = params;
        return `/ai/claude/history?page=${page}&limit=${limit}&type=${type}&timeframe=${timeframe}`;
      },
      providesTags: ["ClaudeHistory"],
    }),

    getClaudeReport: builder.query<ScanResponse, ReportQueryParams>({
      query: ({ reportId, page = 1, limit = 10 }) =>
        `/ai/claude/report/${reportId}?page=${page}&limit=${limit}`,
      providesTags: (result, error, arg) => [
        { type: "ClaudeScan", id: arg.reportId },
      ],
    }),

    downloadClaudeReportPdf: builder.mutation<Blob, string>({
      query: (reportId) => ({
        url: `/reports/${reportId}/pdf`,
        method: "GET",
        responseHandler: (response) => response.blob(),
      }),
    }),

    // --- UPDATED CHAT SYSTEM ENDPOINTS (Strict findingId enforcement) ---
    getClaudeChatHistory: builder.query<
      ChatHistoryResponse,
      { reportId: string; findingId: string }
    >({
      query: ({ reportId, findingId }) =>
        `/reports/${reportId}/chat?findingId=${findingId}`,
      providesTags: (result, error, { findingId }) => [
        { type: "ClaudeChat", id: findingId },
      ],
    }),

    sendClaudeChatMessage: builder.mutation<
      ReportChatSession,
      {
        reportId: string;
        message: string;
        findingId: string; // Made strictly required
        selectedModel?: string;
      }
    >({
      query: ({ reportId, ...chatBody }) => ({
        url: `/reports/${reportId}/chat`,
        method: "POST",
        body: chatBody,
      }),
      invalidatesTags: (result, error, { findingId }) => [
        { type: "ClaudeChat", id: findingId },
      ],
    }),
  }),
});

export const {
  useClaudeScanUrlMutation,
  useClaudeScanRepoMutation,
  useGetClaudeHistoryQuery,
  useGetClaudeReportQuery,
  useDownloadClaudeReportPdfMutation,
  useGetClaudeChatHistoryQuery,
  useSendClaudeChatMessageMutation,
} = claudeApiSlice;
