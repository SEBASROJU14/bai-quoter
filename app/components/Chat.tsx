"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import Message, { MessageData, TypingIndicator } from "./Message";
import ChatInput from "./ChatInput";
import FoxAvatar from "./FoxAvatar";
import { useMediaRecorder, useTTS } from "../hooks/useSpeech";
import InstallPrompt from "./InstallPrompt";

const GREETING =
  "¡Hola! Soy BAÍ, tu asistente de logística. 🦊 Te ayudo a cotizar tu envío hand carry con vuelos reales disponibles.\n\n¿Desde qué ciudad sale tu carga?";

type ClaudeRole = "user" | "assistant";
interface ClaudeMessage {
  role: ClaudeRole;
  content: string;
}

function toClaudeMessages(messages: MessageData[]): ClaudeMessage[] {
  return messages.map((m) => ({
    role: m.role === "bai" ? "assistant" : "user",
    content: m.text,
  }));
}

export default function Chat() {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [typing, setTyping] = useState(false);
  const [lastBaiId, setLastBaiId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const messagesRef = useRef<MessageData[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const { speak, cancel, speaking } = useTTS();

  // Keep ref in sync so handleUserMessage always has latest messages
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const addBaiMessage = useCallback(
    (text: string) => {
      const msg: MessageData = { id: uuid(), role: "bai", text, ts: Date.now() };
      setMessages((prev) => [...prev, msg]);
      setLastBaiId(msg.id);
      setTyping(false);
      setTimeout(() => speak(text), 100);
    },
    [speak]
  );

  // Initial greeting — hardcoded for instant load, no API latency
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setTimeout(() => addBaiMessage(GREETING), 600);
  }, [addBaiMessage]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const handleUserMessage = useCallback(
    async (text: string) => {
      cancel();

      // Abort any in-flight request
      if (abortRef.current) abortRef.current.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      // Build full history including the new user message
      const userMsg: MessageData = { id: uuid(), role: "user", text, ts: Date.now() };
      const allMessages = [...messagesRef.current, userMsg];

      setMessages(allMessages);
      setTyping(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: toClaudeMessages(allMessages) }),
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Start streaming: add empty BAÍ message, fill it with chunks
        const baiMsgId = uuid();
        setTyping(false);
        setLastBaiId(baiMsgId);
        setMessages((prev) => [
          ...prev,
          { id: baiMsgId, role: "bai", text: "", ts: Date.now() },
        ]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          const snapshot = fullText;
          setMessages((prev) =>
            prev.map((m) => (m.id === baiMsgId ? { ...m, text: snapshot } : m))
          );
        }

        // Speak after stream completes
        setTimeout(() => speak(fullText), 80);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[BAÍ]", err);
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: uuid(),
            role: "bai",
            text: "Lo siento, tuve un problema de conexión. ¿Puedes intentarlo de nuevo? 🦊",
            ts: Date.now(),
          },
        ]);
      }
    },
    [cancel, speak]
  );

  const onSpeechResult = useCallback(
    (text: string) => { handleUserMessage(text); },
    [handleUserMessage]
  );

  const { recording, transcribing, supported, toggle } = useMediaRecorder({
    onResult: onSpeechResult,
  });

  const handleMicToggle = useCallback(() => {
    if (speaking) cancel();
    toggle();
  }, [toggle, speaking, cancel]);

  const resetChat = useCallback(() => {
    cancel();
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setTyping(false);
    setLastBaiId(null);
    initialized.current = false;
    setTimeout(() => {
      initialized.current = true;
      addBaiMessage(GREETING);
    }, 400);
  }, [cancel, addBaiMessage]);

  return (
    <div className="flex flex-col h-full bg-[#C8E6F5]">
      <InstallPrompt />

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3.5 bg-[#B0D5EC] border-b border-[#B8A9D9]/25 z-10 flex-shrink-0">
        <FoxAvatar size={44} speaking={speaking} />
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-semibold text-[#2A2438] leading-tight">BAÍ</h1>
          <p className="text-xs text-[#7B74A0] truncate">
            {speaking
              ? "Hablando..."
              : recording
              ? "Grabando..."
              : transcribing
              ? "Transcribiendo..."
              : "Asistente de Logística · Hand Carry"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#B8A9D9] animate-pulse" />
            <span className="text-xs text-[#7B74A0]">en línea</span>
          </div>
          <button
            onClick={resetChat}
            title="Nueva cotización"
            className="text-[#7B74A0] hover:text-[#C44070] transition-colors p-1"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </header>

      {/* Messages — min-h-0 prevents flex overflow that hides the input */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-0">
        {messages.map((msg) => (
          <Message
            key={msg.id}
            msg={msg}
            speaking={speaking && msg.id === lastBaiId}
          />
        ))}
        {typing && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleUserMessage}
        recording={recording}
        transcribing={transcribing}
        speaking={speaking}
        supported={supported}
        onMicToggle={handleMicToggle}
        disabled={typing}
      />
    </div>
  );
}
