"use client";

import { useCallback, useRef, useState, KeyboardEvent } from "react";
import MicButton from "./MicButton";

interface ChatInputProps {
  onSend: (text: string) => void;
  listening: boolean;
  speaking: boolean;
  supported: boolean;
  onMicToggle: () => void;
  disabled?: boolean;
  transcript?: string;
}

export default function ChatInput({
  onSend,
  listening,
  speaking,
  supported,
  onMicToggle,
  disabled,
  transcript,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, onSend]);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const canSend = text.trim().length > 0;

  return (
    <div className="flex items-end gap-3 px-4 py-4 safe-bottom bg-[#B0D5EC] border-t border-[#B8A9D9]/25 flex-shrink-0">
      <MicButton
        listening={listening}
        speaking={speaking}
        supported={supported}
        onToggle={onMicToggle}
      />

      <div className="flex-1 flex items-end gap-2 bg-white/65 border border-[#B8A9D9]/40 rounded-[20px] px-4 py-3 focus-within:border-[#B8A9D9]/70 transition-colors">
        {listening && (
          <div className="flex-1 text-[18px] text-[#C44070]/80 italic py-0.5 min-h-[26px]">
            {transcript || "Escuchando..."}
          </div>
        )}
        {!listening && (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKey}
            placeholder="Escribe o usa el micrófono..."
            rows={1}
            className="flex-1 bg-transparent text-[18px] text-[#2A2438] placeholder-[#7B74A0]/60 outline-none resize-none max-h-[120px] py-0.5 leading-relaxed"
          />
        )}
      </div>

      <button
        onClick={handleSend}
        disabled={!canSend}
        aria-label="Enviar"
        className={`
          w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0
          transition-all duration-200 active:scale-95
          ${canSend
            ? "bg-gradient-to-br from-[#F4A7B9] to-[#B8A9D9] text-[#2A2438] pink-glow shadow-md"
            : "bg-white/40 text-[#7B74A0]/40 cursor-not-allowed border border-[#B8A9D9]/25"
          }
        `}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  );
}
