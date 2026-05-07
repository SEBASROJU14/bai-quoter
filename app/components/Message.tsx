"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";
import FoxAvatar from "./FoxAvatar";

export interface MessageData {
  id: string;
  role: "bai" | "user";
  text: string;
  ts: number;
}

const mdComponents: Components = {
  // *texto* → negrita rosa profundo (legible en fondo claro)
  em({ children }) {
    return <strong className="text-[#C44070] font-semibold not-italic">{children}</strong>;
  },
  // **texto** → negrita oscura
  strong({ children }) {
    return <strong className="font-semibold text-[#2A2438]">{children}</strong>;
  },
  // --- → separador visual entre opciones de vuelo
  hr() {
    return <div className="my-5 border-t border-[#B8A9D9]/40" />;
  },
  // Párrafos con espaciado
  p({ children }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
  // Listas
  ul({ children }) {
    return <ul className="list-none mb-2 space-y-1">{children}</ul>;
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
};

interface TypingIndicatorProps {}

export function TypingIndicator(_: TypingIndicatorProps) {
  return (
    <div className="flex items-end gap-3 mb-5">
      <FoxAvatar size={36} />
      <div className="bubble-bai rounded-[24px] rounded-bl-[6px] px-5 py-4 flex items-center gap-1.5">
        <span className="typing-dot w-2 h-2 rounded-full bg-[#B8A9D9]" />
        <span className="typing-dot w-2 h-2 rounded-full bg-[#B8A9D9]" />
        <span className="typing-dot w-2 h-2 rounded-full bg-[#B8A9D9]" />
      </div>
    </div>
  );
}

export default function Message({ msg, speaking }: { msg: MessageData; speaking?: boolean }) {
  const isBai = msg.role === "bai";

  if (isBai) {
    return (
      <div className="flex items-end gap-3 mb-5">
        <FoxAvatar size={36} speaking={speaking} />
        <div className="flex flex-col max-w-[84%]">
          <div className="bubble-bai rounded-[24px] rounded-bl-[6px] px-5 py-4 text-[18px] text-[#2A2438]">
            <ReactMarkdown
              remarkPlugins={[remarkBreaks]}
              components={mdComponents}
            >
              {msg.text}
            </ReactMarkdown>
          </div>
          <span className="text-xs text-[#7B74A0] mt-1.5 ml-1">
            {new Date(msg.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end justify-end gap-3 mb-5">
      <div className="flex flex-col items-end max-w-[84%]">
        <div className="bubble-user rounded-[24px] rounded-br-[6px] px-5 py-4 text-[18px] leading-relaxed text-[#2A2438]">
          {msg.text}
        </div>
        <span className="text-xs text-[#7B74A0] mt-1.5 mr-1">
          {new Date(msg.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
