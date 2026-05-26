//src/components/pages/aiLab/ClaudeModelPicker.tsx
"use client";

import { cn } from "@/lib/utils";
import {
  CLAUDE_MODEL_CATALOG,
  type ClaudeModelId,
} from "@/lib/features/ai/claude/claudeTypes";

interface ClaudeModelPickerProps {
  value: ClaudeModelId;
  onChange: (next: ClaudeModelId) => void;
  disabled?: boolean;
}

export default function ClaudeModelPicker({
  value,
  onChange,
  disabled,
}: ClaudeModelPickerProps) {
  return (
    <div className="flex flex-col gap-2 border-3 border-double p-3 bg-background">
      <span className="text-xs font-bold text-orange-500">Claude Model</span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {CLAUDE_MODEL_CATALOG.map((m) => {
          const active = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(m.id)}
              className={cn(
                "border-3 border-double p-3 text-left flex flex-col gap-1 transition-all disabled:opacity-50",
                active
                  ? "border-orange-500 bg-orange-500/10 text-orange-500"
                  : "border-foreground/30 opacity-70 hover:opacity-100 hover:border-primary",
              )}
            >
              <span className="text-xs font-bold uppercase">{m.label}</span>
              <span className="text-[10px] font-bold opacity-80">
                {m.tagline}
              </span>
              <span className="text-[10px] font-bold opacity-70 leading-snug">
                {m.strengths}
              </span>
              <span className="text-[10px] font-bold opacity-50 leading-snug">
                {m.tradeoff}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
