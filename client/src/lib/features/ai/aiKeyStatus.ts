export type AiKeyStatusType =
  | "restricted" // scenario 1: no personal key, no global access
  | "personal-only" // scenario 2: personal key, no global access
  | "global-fallback" // scenario 4: no personal key, has global access
  | "personal-active" // scenario 3/5: has both, currently using personal
  | "global-forced"; // scenario 3/5: has both, currently using global

export interface AiKeyStatus {
  type: AiKeyStatusType;
  label: string;
  ctaText: string | null; // null = no CTA needed
}

export function getAiKeyStatus(
  user: any,
  engine: "gemini" | "claude",
): AiKeyStatus {
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const canUseSystemKeys = user?.has_system_ai_access === true || isAdmin;
  const hasPersonalKey =
    engine === "gemini" ? !!user?.hasGeminiKey : !!user?.hasClaudeKey;

  // FIX IS HERE: changed prefer_system_ai_key to preferSystemAiKey
  const preferSystem = user?.preferSystemAiKey === true;

  // Scenario 1
  if (!hasPersonalKey && !canUseSystemKeys) {
    return {
      type: "restricted",
      label: "🔴 AI Access Restricted",
      ctaText: "Add personal key",
    };
  }

  // Scenario 2 — personal key, no global grant. No "switch to global" CTA, ever.
  if (hasPersonalKey && !canUseSystemKeys) {
    return {
      type: "personal-only",
      label: "🔵 Using Personal Key",
      ctaText: null,
    };
  }

  // Scenario 4 — no personal key, has global grant
  if (!hasPersonalKey && canUseSystemKeys) {
    return {
      type: "global-fallback",
      label: "🟢 Using Global App Key (Fallback)",
      ctaText: "Add personal key",
    };
  }

  // Scenario 3/5 — has both. Direction of the CTA depends on which is active NOW.
  if (preferSystem) {
    return {
      type: "global-forced",
      label: "🟠 Using Global App Key (Forced)",
      ctaText: "Switch to Personal Key",
    };
  }
  return {
    type: "personal-active",
    label: "🔵 Using Personal Key",
    ctaText: "Switch to Global Key",
  };
}
