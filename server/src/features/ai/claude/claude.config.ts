// Define the central object mapping your internal logic to Anthropic's API strings
export const CLAUDE_MODELS = {
  SONNET_LATEST: "claude-sonnet-4-6",
  OPUS_LATEST: "claude-opus-4-7",
  HAIKU_LATEST: "claude-haiku-4-5",
} as const;

// Automatically extract the string values into a reusable TypeScript type
export type ClaudeModelId = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

// Set your global fallback (Sonnet is typically the best balance for Claude)
export const DEFAULT_CLAUDE_MODEL: ClaudeModelId = CLAUDE_MODELS.SONNET_LATEST;

// Export an array for easy validation in your controllers
export const VALID_CLAUDE_MODELS = Object.values(CLAUDE_MODELS);
