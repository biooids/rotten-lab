//src/features/ai/gemini/gemini.config.ts
// Define the central object mapping your internal logic to Google's API strings
export const GEMINI_MODELS = {
  FLASH_LATEST: "gemini-3.6-flash",
  FLASH_LITE: "gemini-3.5-flash-lite",
  PRO_LATEST: "gemini-3.1-pro-preview",
  PRO_STABLE: "gemini-2.5-pro",
} as const;

// Automatically extract the string values into a reusable TypeScript type
export type GeminiModelId = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

// Set your global fallback
export const DEFAULT_GEMINI_MODEL: GeminiModelId = GEMINI_MODELS.FLASH_LATEST;

// Export an array for easy validation in your controllers
export const VALID_GEMINI_MODELS = Object.values(GEMINI_MODELS);
