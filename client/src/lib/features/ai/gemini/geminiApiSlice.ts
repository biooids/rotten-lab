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
} from "./geminiTypes";
import { baseQueryWithReauth } from "@/lib/api/baseQueryWithReauth";

export const geminiApiSlice = createApi({
  reducerPath: "geminiApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["GeminiScan", "GeminiHistory", "GeminiChat"],
  endpoints: (builder) => ({
    scanUrl: builder.mutation<InitScanResponse, ScanRequestDTO>({
      query: (scanData) => ({
        url: "/ai/gemini/scan-url",
        method: "POST",
        body: scanData,
      }),
      invalidatesTags: ["GeminiHistory"],
    }),

    scanRepo: builder.mutation<InitScanResponse, ScanRequestDTO>({
      query: (scanData) => ({
        url: "/ai/gemini/scan-repo",
        method: "POST",
        body: scanData,
      }),
      invalidatesTags: ["GeminiHistory"],
    }),

    getHistory: builder.query<ScanHistoryResponse, HistoryQueryParams | void>({
      query: (params) => {
        if (!params) return "/ai/gemini/history";
        const {
          page = 1,
          limit = 10,
          type = "all",
          timeframe = "all",
        } = params;
        return `/ai/gemini/history?page=${page}&limit=${limit}&type=${type}&timeframe=${timeframe}`;
      },
      providesTags: ["GeminiHistory"],
    }),

    getReport: builder.query<ScanResponse, ReportQueryParams>({
      query: ({ reportId, page = 1, limit = 10 }) =>
        `/ai/gemini/report/${reportId}?page=${page}&limit=${limit}`,
      providesTags: (result, error, arg) => [
        { type: "GeminiScan", id: arg.reportId },
      ],
    }),

    downloadGeminiReportPdf: builder.mutation<Blob, string>({
      query: (reportId) => ({
        url: `/reports/${reportId}/pdf`,
        method: "GET",
        responseHandler: (response) => response.blob(),
      }),
    }),

    // --- UPDATED CHAT SYSTEM ENDPOINTS (Strict findingId enforcement) ---
    getChatHistory: builder.query<
      ChatHistoryResponse,
      { reportId: string; findingId: string }
    >({
      query: ({ reportId, findingId }) =>
        `/reports/${reportId}/chat?findingId=${findingId}`,
      providesTags: (result, error, { findingId }) => [
        { type: "GeminiChat", id: findingId },
      ],
    }),

    sendChatMessage: builder.mutation<
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
        { type: "GeminiChat", id: findingId },
      ],
    }),
  }),
});

export const {
  useScanUrlMutation,
  useScanRepoMutation,
  useGetHistoryQuery,
  useGetReportQuery,
  useDownloadGeminiReportPdfMutation,
  useGetChatHistoryQuery,
  useSendChatMessageMutation,
} = geminiApiSlice;
