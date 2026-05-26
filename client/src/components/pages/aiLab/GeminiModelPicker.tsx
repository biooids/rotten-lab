//src/components/pages/aiLab/GeminiModelPicker.tsx
"use client";

import { cn } from "@/lib/utils";
import {
  GEMINI_MODEL_CATALOG,
  type GeminiModelId,
} from "@/lib/features/ai/gemini/geminiTypes";

interface GeminiModelPickerProps {
  value: GeminiModelId;
  onChange: (next: GeminiModelId) => void;
  disabled?: boolean;
}

export default function GeminiModelPicker({
  value,
  onChange,
  disabled,
}: GeminiModelPickerProps) {
  return (
    <div className="flex flex-col gap-2 border-3 border-double p-3 bg-background">
      <span className="text-xs font-bold text-blue-500">Gemini Model</span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {GEMINI_MODEL_CATALOG.map((m) => {
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
                  ? "border-blue-500 bg-blue-500/10 text-blue-500"
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
