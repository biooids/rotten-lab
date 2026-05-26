//src/lib/features/ai/gemini/geminiSchema.ts
import { z } from "zod";

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
        "Please enter a valid website URL address (e.g., https://example.com).",
    }),
  // Relaxed schema check: allows empty values for admins while parsing safely
  secretAccessKey: z.string().optional().or(z.literal("")),
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
  // Relaxed schema check: allows empty values for admins while parsing safely
  secretAccessKey: z.string().optional().or(z.literal("")),
});

export type UrlScanInput = z.infer<typeof urlScanSchema>;
export type RepoScanInput = z.infer<typeof repoScanSchema>;
