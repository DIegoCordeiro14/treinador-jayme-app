"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SUGGESTED_PROMPTS = [
  "Monte um treino ABCD para hipertrofia",
  "Como progressar minha carga no supino?",
  "Quando devo fazer deload?",
  "Qual a frequência ideal para naturais?",
  "Explique o método RIR",
  "Monte um plano para iniciante 3x por semana",
];

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  showSuggestions: boolean;
  onSuggestionClick: (prompt: string) => void;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  showSuggestions,
  onSuggestionClick,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px";
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSend();
      }
    }
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950 p-4">
      {/* Suggestions */}
      {showSuggestions && (
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSuggestionClick(prompt)}
              className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-400 hover:border-blue-600/50 hover:text-blue-400 hover:bg-blue-600/5 transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0 rounded-xl border border-zinc-700 bg-zinc-800/50 focus-within:border-blue-600/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte ao Treinador Jayme... (Enter para enviar)"
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none min-h-[44px] max-h-40"
            rows={1}
            disabled={isLoading}
          />
        </div>
        <button
          onClick={onSend}
          disabled={!value.trim() || isLoading}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl transition-all",
            value.trim() && !isLoading
              ? "bg-blue-600 text-white hover:bg-blue-500 shadow-glow-blue-sm"
              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      <p className="text-[10px] text-zinc-600 mt-2 text-center">
        Treinador Jayme usa IA — sempre consulte um profissional para questões de saúde
      </p>
    </div>
  );
}
