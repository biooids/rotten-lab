//src/components/pages/aiLab/ChatWithAI.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  useGetChatHistoryQuery,
  useSendChatMessageMutation,
} from "@/lib/features/ai/gemini/geminiApiSlice";
import {
  useGetClaudeChatHistoryQuery,
  useSendClaudeChatMessageMutation,
} from "@/lib/features/ai/claude/claudeApiSlice";
import { GEMINI_MODEL_CATALOG } from "@/lib/features/ai/gemini/geminiTypes";
import { CLAUDE_MODEL_CATALOG } from "@/lib/features/ai/claude/claudeTypes";
import CornerFlourish from "@/components/shared/CornerFlourish";

interface ChatWithAIProps {
  reportId: string;
  engine: string;
  findingId: string; // Strictly required
}

export default function ChatWithAI({
  reportId,
  engine,
  findingId,
}: ChatWithAIProps) {
  // --- STATE ---
  const [message, setMessage] = useState("");
  const [chatError, setChatError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Determine which catalog to use based on the engine
  const availableModels =
    engine === "claude" ? CLAUDE_MODEL_CATALOG : GEMINI_MODEL_CATALOG;

  // Default to the fastest/cheapest model based on the catalog
  const defaultModelId =
    engine === "claude" ? "claude-haiku-4-5" : "gemini-2.5-flash";
  const [selectedModel, setSelectedModel] = useState<string>(defaultModelId);

  // --- RTK QUERY HOOKS ---
  const { data: geminiData, isFetching: isGeminiFetching } =
    useGetChatHistoryQuery(
      { reportId, findingId },
      { skip: engine !== "gemini" },
    );
  const [sendGeminiMessage, { isLoading: isGeminiSending }] =
    useSendChatMessageMutation();

  const { data: claudeData, isFetching: isClaudeFetching } =
    useGetClaudeChatHistoryQuery(
      { reportId, findingId },
      { skip: engine !== "claude" },
    );
  const [sendClaudeMessage, { isLoading: isClaudeSending }] =
    useSendClaudeChatMessageMutation();

  // --- DERIVED DATA ---
  const history =
    engine === "claude" ? claudeData?.history : geminiData?.history;
  const isFetching = engine === "claude" ? isClaudeFetching : isGeminiFetching;
  const isSending = engine === "claude" ? isClaudeSending : isGeminiSending;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isSending]);

  // --- HANDLERS ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;

    setChatError("");

    const payload = {
      reportId,
      message: message.trim(),
      selectedModel,
      findingId,
    };

    try {
      if (engine === "claude") {
        await sendClaudeMessage(payload).unwrap();
      } else {
        await sendGeminiMessage(payload).unwrap();
      }
      setMessage(""); // Clear input on success
    } catch (err: any) {
      // REMOVED console.error() HERE so Next.js dev server stops hijacking the screen.
      // Now it will gracefully drop down to the UI error box below.
      setChatError(
        err?.data?.error ||
          err?.error ||
          err?.message ||
          "Transmission failed. Ensure you have network connectivity.",
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  return (
    <div className="relative border-3 border-double bg-background flex flex-col">
      <CornerFlourish className="-top-1 -left-1" />
      <CornerFlourish className="-top-1 -right-1 rotate-90" />

      {/* HEADER */}
      <div className="border-b-3 border-double p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-none bg-primary animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            AI Assistant
          </h3>
        </div>

        {/* MODEL SELECTOR */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-[10px] font-bold uppercase opacity-80 whitespace-nowrap">
            Compute:
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isSending}
            className="text-[10px] font-bold bg-background border-3 border-double px-2 py-1 outline-none w-full sm:w-auto focus:border-primary disabled:opacity-50 cursor-pointer"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CHAT WINDOW */}
      <div
        ref={scrollRef}
        className="h-64 overflow-y-auto p-4 flex flex-col gap-4 bg-background/50 scroll-smooth"
      >
        {isFetching && !history ? (
          <div className="text-xs font-bold text-center opacity-70 animate-pulse mt-8">
            [ ESTABLISHING CONNECTION... ]
          </div>
        ) : history?.length === 0 ? (
          <div className="text-[10px] font-bold text-center opacity-50 mt-8 uppercase">
            Ask for remediation advice or an explanation of this specific
            finding.
          </div>
        ) : (
          history?.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col max-w-[90%]",
                msg.role === "user"
                  ? "self-end items-end"
                  : "self-start items-start",
              )}
            >
              <span className="text-[10px] font-bold uppercase opacity-50 mb-1">
                {msg.role === "user" ? "YOU" : `AI (${engine})`}
              </span>
              <div
                className={cn(
                  "border-3 border-double p-3 text-xs font-medium whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-card border-primary/50 text-foreground"
                    : "bg-primary/5 border-primary text-primary",
                )}
              >
                {msg.message}
              </div>
            </div>
          ))
        )}

        {isSending && (
          <div className="self-start flex flex-col max-w-[90%]">
            <span className="text-[10px] font-bold uppercase opacity-50 mb-1">
              AI ({engine})
            </span>
            <div className="border-3 border-double border-primary bg-primary/5 text-primary p-3 text-xs font-medium">
              <span className="animate-pulse">Processing request...</span>
            </div>
          </div>
        )}
      </div>

      {/* INPUT AREA */}
      <form
        onSubmit={handleSendMessage}
        className="border-t-3 border-double flex flex-col sm:flex-row bg-card"
      >
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this vulnerability... (Shift+Enter for new line)"
          disabled={isSending || isFetching}
          className="flex-1 bg-transparent border-none outline-none p-3 text-xs resize-none min-h-[50px] disabled:opacity-50"
          rows={2}
        />
        <button
          type="submit"
          disabled={isSending || !message.trim()}
          className="border-t-3 sm:border-t-0 sm:border-l-3 border-double px-4 py-3 sm:py-0 text-xs font-bold uppercase hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:bg-card disabled:hover:text-foreground transition-colors cursor-pointer"
        >
          [ SEND ]
        </button>
      </form>

      {/* ERROR BANNER (MOVED BELOW INPUT FORM) */}
      {chatError && (
        <div className="border-t-3 border-double border-destructive bg-destructive/10 text-destructive text-[10px] font-bold p-3 uppercase flex flex-col gap-1">
          <span className="animate-pulse">[ COMM LINK ERROR ]</span>
          <span>{chatError}</span>
        </div>
      )}
    </div>
  );
}
