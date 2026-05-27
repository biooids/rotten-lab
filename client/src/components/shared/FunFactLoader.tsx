//src/components/shared/FunFactLoader.tsx
"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface FunFactLoaderProps {
  title?: string;
  engine?: string;
  facts?: string[];
}

const DEFAULT_FACTS = [
  "The first computer virus was created in 1971. It was called the 'Creeper' and just printed: 'I'm the creeper, catch me if you can!'",
  "CAPTCHA stands for 'Completely Automated Public Turing test to tell Computers and Humans Apart'.",
  "In 1999, a 15-year-old hacked NASA and the Pentagon, causing a 21-day shutdown of their defense computers.",
  "SQL injection was first documented publicly in 1998. It is still one of the most common web vulnerabilities decades later.",
  "The term 'hacker' originally referred to highly skilled, creative programmers at MIT in the 1960s, not criminals.",
  "More than 90% of successful corporate cyberattacks begin with a simple phishing email.",
  "The ILOVEYOU bug in 2000 caused an estimated $10 billion in damages worldwide by overwriting personal files.",
];

export default function FunFactLoader({
  title = "Processing request...",
  engine,
  facts = DEFAULT_FACTS,
}: FunFactLoaderProps) {
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (!facts || facts.length <= 1) return;

    const intervalId = setInterval(() => {
      // Trigger fade out
      setIsFading(true);

      // Wait for fade out to complete, then swap text and fade back in
      setTimeout(() => {
        setCurrentFactIndex((prev) => (prev + 1) % facts.length);
        setIsFading(false);
      }, 500); // 500ms matches the CSS transition duration
    }, 4500); // Show each fact for 4.5 seconds

    return () => clearInterval(intervalId);
  }, [facts]);

  // Determine engine-specific colors for the loader borders and text
  const isClaude = engine?.toLowerCase() === "claude";
  const isGemini = engine?.toLowerCase() === "gemini";

  const engineColorClass = isClaude
    ? "border-orange-500 text-orange-500"
    : isGemini
      ? "border-blue-500 text-blue-500"
      : "border-primary text-primary";

  const engineBgClass = isClaude
    ? "bg-orange-500/10"
    : isGemini
      ? "bg-blue-500/10"
      : "bg-primary/10";

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8">
      {/* FUN FACT TERMINAL BOX */}
      <div className="w-full max-w-lg border-3 border-double bg-background flex flex-col">
        <div
          className={cn(
            "border-b-3 border-double px-3 py-1 text-[10px] font-bold  ",
            engineColorClass,
            engineBgClass,
          )}
        >
          Let's see some fun facts while waiting for the backend
          response...{" "}
        </div>
        <div className="p-4 min-h-[100px] flex items-center justify-center">
          <p
            className={cn(
              "text-xs font-bold text-center transition-opacity duration-500",
              isFading ? "opacity-0" : "opacity-100",
            )}
          >
            {facts[currentFactIndex]}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "border-3 border-double p-2 max-w-sm w-full bg-card",
          engineColorClass,
        )}
      >
        <img
          src="https://media1.tenor.com/m/qhfzQWre-ewAAAAC/dance-anime-girl.gif"
          alt="Hacker typing aggressively"
          className="w-full h-auto object-cover"
        />
      </div>

      {/* PULSING STATUS TITLE */}
      <div className="flex flex-col items-center gap-2 mt-4">
        <span
          className={cn("text-xs font-bold  animate-pulse", engineColorClass)}
        >
          {title}
        </span>
      </div>
    </div>
  );
}
