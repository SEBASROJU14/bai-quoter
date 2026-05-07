"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionConstructor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: {
    results: { [i: number]: { [j: number]: { transcript: string } } };
  }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

interface UseSpeechOptions {
  onResult: (text: string) => void;
  onEnd?: () => void;
}

export function useSpeechRecognition({ onResult, onEnd }: UseSpeechOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onResultRef.current = onResult;
    onEndRef.current = onEnd;
  }, [onResult, onEnd]);

  useEffect(() => {
    const API = getSpeechRecognition();
    if (!API) return;
    setSupported(true);

    const rec = new API();
    rec.lang = "es-MX";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript;
      onResultRef.current(transcript);
    };

    rec.onend = () => {
      setListening(false);
      onEndRef.current?.();
    };

    rec.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = rec;

    return () => {
      rec.abort();
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || listening) return;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // already started
    }
  }, [listening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !listening) return;
    recognitionRef.current.stop();
    setListening(false);
  }, [listening]);

  const toggle = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  return { listening, supported, toggle, startListening, stopListening };
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation, keeping chunks short enough for Chrome TTS
  const parts = text.split(/(?<=[.?!])\s+/);
  const chunks: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Further split long chunks at commas/semicolons if over 140 chars
    if (trimmed.length <= 140) {
      chunks.push(trimmed);
    } else {
      const sub = trimmed.split(/(?<=[,;:])\s+/);
      let current = "";
      for (const piece of sub) {
        if ((current + " " + piece).trim().length > 140 && current) {
          chunks.push(current.trim());
          current = piece;
        } else {
          current = current ? current + " " + piece : piece;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }
  return chunks.filter(Boolean);
}

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const queueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopKeepalive = useCallback(() => {
    if (keepaliveRef.current !== null) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, []);

  const startKeepalive = useCallback(() => {
    stopKeepalive();
    // Chrome pauses speechSynthesis in background tabs; nudging it every 10s keeps it alive
    keepaliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } else {
        stopKeepalive();
      }
    }, 10000);
  }, [stopKeepalive]);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    queueRef.current = [];

    const clean = text
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
      .replace(/\n+/g, ". ")
      .trim();

    const sentences = splitSentences(clean);
    if (!sentences.length) return;

    const voices = window.speechSynthesis.getVoices();
    const esVoice =
      voices.find((v) => v.lang.startsWith("es") && v.name.includes("Google")) ||
      voices.find((v) => v.lang.startsWith("es")) ||
      null;

    const utterances = sentences.map((s) => {
      const u = new SpeechSynthesisUtterance(s);
      u.lang = "es-MX";
      u.rate = 1.05;
      u.pitch = 1.1;
      u.volume = 1;
      if (esVoice) u.voice = esVoice;
      return u;
    });

    queueRef.current = utterances;

    utterances[0].onstart = () => {
      setSpeaking(true);
      startKeepalive();
    };

    utterances.forEach((u, i) => {
      u.onend = () => {
        queueRef.current = queueRef.current.slice(1);
        if (i < utterances.length - 1) {
          window.speechSynthesis.speak(utterances[i + 1]);
        } else {
          stopKeepalive();
          setSpeaking(false);
        }
      };
      u.onerror = () => {
        queueRef.current = [];
        stopKeepalive();
        setSpeaking(false);
      };
    });

    window.speechSynthesis.speak(utterances[0]);
  }, [startKeepalive, stopKeepalive]);

  const cancel = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis.cancel();
    queueRef.current = [];
    stopKeepalive();
    setSpeaking(false);
  }, [stopKeepalive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.getVoices();
    const handler = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      stopKeepalive();
    };
  }, [stopKeepalive]);

  return { speak, cancel, speaking };
}
