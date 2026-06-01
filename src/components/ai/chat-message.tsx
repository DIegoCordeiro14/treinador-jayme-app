"use client";

import { cn } from "@/lib/utils";
import { Zap, User } from "lucide-react";
import type { AIMessage } from "@/types";

interface ChatMessageProps {
  message: AIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isUser ? "bg-zinc-700" : "bg-blue-600"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-zinc-300" />
        ) : (
          <Zap className="h-4 w-4 text-white" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-zinc-800 text-zinc-100 rounded-tr-sm"
            : "bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-sm"
        )}
      >
        {/* Format content — preserve line breaks and bold markers */}
        {message.content.split("\n").map((line, i) => {
          // Handle **bold** markers
          const parts = line.split(/\*\*(.*?)\*\*/g);
          return (
            <p key={i} className={cn(line === "" ? "h-3" : "")}>
              {parts.map((part, j) =>
                j % 2 === 1 ? (
                  <strong key={j} className="font-semibold text-zinc-100">
                    {part}
                  </strong>
                ) : (
                  <span key={j}>{part}</span>
                )
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600">
        <Zap className="h-4 w-4 text-white" />
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
          <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
