// src/components/pages/aiLab/ChatWithAI.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  findingId: string;
}

export default function ChatWithAI({
  reportId,
  engine,
  findingId,
}: ChatWithAIProps) {
  // --- STATE ---
  const [message, setMessage] = useState("");
  const [chatError, setChatError] = useState("");
  const [lastAttemptedMessage, setLastAttemptedMessage] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const availableModels =
    engine === "claude" ? CLAUDE_MODEL_CATALOG : GEMINI_MODEL_CATALOG;

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

  const history =
    engine === "claude" ? claudeData?.history : geminiData?.history;
  const isFetching = engine === "claude" ? isClaudeFetching : isGeminiFetching;
  const isSending = engine === "claude" ? isClaudeSending : isGeminiSending;

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isSending]);

  // --- REAL ELAPSED TIMER ---
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isSending) {
      intervalId = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }

    return () => clearInterval(intervalId);
  }, [isSending]);

  // --- HANDLERS ---
  const handleSendMessage = async (msgOverride?: string | React.FormEvent) => {
    // Prevent default if called from form submit
    if (typeof msgOverride === "object" && "preventDefault" in msgOverride) {
      msgOverride.preventDefault();
      msgOverride = undefined;
    }

    const finalMessage = (
      typeof msgOverride === "string" ? msgOverride : message
    ).trim();
    if (!finalMessage || isSending) return;

    setChatError("");
    setLastAttemptedMessage(finalMessage); // Save for manual retry

    const payload = {
      reportId,
      message: finalMessage,
      selectedModel,
      findingId,
    };

    try {
      if (engine === "claude") {
        await sendClaudeMessage(payload).unwrap();
      } else {
        await sendGeminiMessage(payload).unwrap();
      }
      setMessage(""); // Clear input only on success
      setLastAttemptedMessage(""); // Clear retry state
    } catch (err: any) {
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
      handleSendMessage();
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
          <h3 className="text-sm font-bold  tracking-wider">AI Assistant</h3>
        </div>

        {/* MODEL SELECTOR */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-sm font-bold  opacity-80 whitespace-nowrap">
            Compute:
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isSending}
            className="text-sm font-bold bg-background border-3 border-double px-2 py-1 outline-none w-full sm:w-auto focus:border-primary disabled:opacity-50 cursor-pointer"
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
          <div className="text-sm font-bold text-center opacity-70 animate-pulse mt-8">
            Loading chat history...
          </div>
        ) : history?.length === 0 ? (
          <div className="text-sm font-bold text-center opacity-50 mt-8 ">
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
              <span className="text-sm font-bold  opacity-50 mb-1">
                {msg.role === "user" ? "YOU" : `AI (${engine})`}
              </span>
              <div
                className={cn(
                  "border-3 border-double p-3 text-xs font-medium",
                  msg.role === "user"
                    ? "bg-card border-primary/50 text-foreground whitespace-pre-wrap"
                    : "bg-primary/5 border-primary text-primary",
                )}
              >
                {msg.role === "user" ? (
                  msg.message
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-snug prose-pre:bg-background prose-pre:border-2 prose-pre:border-primary/50 text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.message}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isSending && (
          <div className="self-start flex flex-col max-w-[90%] w-full">
            <span className="text-sm font-bold  opacity-50 mb-1">
              AI ({engine})
            </span>
            <div
              className={cn(
                "border-3 border-double p-3 text-xs font-bold flex flex-col gap-1 transition-colors",
                elapsedSeconds > 15
                  ? "border-yellow-500 text-yellow-500 bg-yellow-500/10"
                  : "border-primary text-primary bg-primary/10",
              )}
            >
              <span className="animate-pulse">
                {elapsedSeconds > 15
                  ? " AI is running deep analysis... "
                  : "Processing request... "}
              </span>
              <span className="opacity-80 font-medium">
                {elapsedSeconds > 15
                  ? "The AI provider is taking longer than expected. Please wait."
                  : "Sending prompt to AI model."}
              </span>
              <span className="opacity-60 mt-1 font-mono text-sm">
                Time elapsed: {elapsedSeconds}s
              </span>
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
          className="border-t-3 sm:border-t-0 sm:border-l-3 border-double px-4 py-3 sm:py-0 text-xs font-bold  hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:bg-card disabled:hover:text-foreground transition-colors cursor-pointer"
        >
          Send
        </button>
      </form>

      {/* ERROR BANNER WITH MANUAL RETRY */}
      {chatError && (
        <div className="border-t-3 border-double border-destructive bg-destructive/10 p-3 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <div className="text-destructive text-sm font-bold  flex flex-col gap-1">
            <span className="animate-pulse">
              An Error occurred while sending :{" "}
            </span>
            <span>{chatError}</span>
          </div>

          {lastAttemptedMessage && (
            <button
              onClick={(e) => {
                e.preventDefault();
                handleSendMessage(lastAttemptedMessage);
              }}
              disabled={isSending}
              className="whitespace-nowrap border-3 border-double border-destructive text-destructive px-3 py-1 text-sm font-bold hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50 cursor-pointer"
            >
              Retry last message
            </button>
          )}
        </div>
      )}
    </div>
  );
}
