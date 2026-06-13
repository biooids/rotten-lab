//src/lib/features/ai/gemini/geminiSchema.ts
import { z } from "zod";

// Relaxed regex: HTTP/HTTPS protocol is optional. The backend controller
// will automatically prepend 'https://' if it is missing.
const URL_REGEX = /^(https?:\/\/)?([\w\d\-_]+\.)+\.?[\w\d\-_]+(\/.*)?$/i;
const GITHUB_REGEX =
  /^(https?:\/\/)?(www\.)?github\.com\/[\w\d\-_]+\/[\w\d\-_]+.*$/i;

export const urlScanSchema = z.object({
  targetUrl: z
    .string()
    .min(1, "Website target URL is required.")
    .max(2048, "URL path length cannot exceed 2048 characters.")
    .refine((url) => URL_REGEX.test(url), {
      message:
        "Please enter a valid website URL address (e.g., example.com or https://example.com).",
    }),
});

export const repoScanSchema = z.object({
  targetUrl: z
    .string()
    .min(1, "GitHub repository target URL is required.")
    .max(2048, "URL path length cannot exceed 2048 characters.")
    .refine((url) => GITHUB_REGEX.test(url), {
      message:
        "Invalid GitHub link. Expected format: github.com/username/reponame",
    }),
});

export type UrlScanInput = z.infer<typeof urlScanSchema>;
export type RepoScanInput = z.infer<typeof repoScanSchema>;
