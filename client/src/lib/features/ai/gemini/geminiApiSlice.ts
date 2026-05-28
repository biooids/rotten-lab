import { createApi } from "@reduxjs/toolkit/query/react";
import {
  ScanRequestDTO,
  InitScanResponse,
  ScanResponse,
  ScanHistoryResponse,
  HistoryQueryParams,
  ReportQueryParams,
} from "./geminiTypes";
import { baseQueryWithReauth } from "@/lib/api/baseQueryWithReauth";

export const geminiApiSlice = createApi({
  reducerPath: "geminiApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["GeminiScan", "GeminiHistory"],
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

    // FIXED: Now points directly to the dedicated reports service instead of the AI router
    downloadGeminiReportPdf: builder.mutation<Blob, string>({
      query: (reportId) => ({
        url: `/reports/${reportId}/pdf`,
        method: "GET",
        responseHandler: (response) => response.blob(),
      }),
    }),
  }),
});

export const {
  useScanUrlMutation,
  useScanRepoMutation,
  useGetHistoryQuery,
  useGetReportQuery,
  useDownloadGeminiReportPdfMutation,
} = geminiApiSlice;
