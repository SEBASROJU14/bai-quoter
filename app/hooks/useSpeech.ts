"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── MediaRecorder-based voice input ──────────────────────────────────────────
// Uses MediaRecorder (works on iOS Safari 14.5+) + server-side Whisper
// transcription instead of Web Speech API (unreliable on iOS).

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

interface UseMediaRecorderOptions {
  onResult: (text: string) => void;
  onError?: (msg: string) => void;
}

export function useMediaRecorder({ onResult, onError }: UseMediaRecorderOptions) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [supported, setSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  useEffect(() => {
    if (typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia) {
      setSupported(true);
    }
  }, []);

  const start = useCallback(() => {
    if (recording || transcribing) return;

    // getUserMedia is initiated synchronously within the user-gesture handler,
    // satisfying iOS Safari's requirement even though it resolves asynchronously.
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mimeType = getSupportedMimeType();
        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined
        );
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());

          // iOS Safari produces audio/mp4 → use .m4a so Whisper recognises it
          const ext = mimeType.includes("mp4") ? "m4a"
            : mimeType.includes("ogg") ? "ogg"
            : "webm";
          const blob = new Blob(chunksRef.current, {
            type: mimeType || "audio/webm",
          });
          chunksRef.current = [];
          recorderRef.current = null;

          console.log("[MediaRecorder] onstop — chunks:", blob.size, "bytes, type:", blob.type, "ext:", ext);

          if (blob.size < 1000) {
            console.warn("[MediaRecorder] blob too small, skipping transcription");
            onErrorRef.current?.("La grabación fue demasiado corta. Intenta de nuevo.");
            return;
          }

          setTranscribing(true);
          const form = new FormData();
          form.append("audio", blob, `recording.${ext}`);

          // 25-second client-side timeout — prevents stuck "Transcribiendo..." forever
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25000);

          fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal })
            .then((r) => {
              clearTimeout(timeout);
              return r.json().then((body: { text?: string; error?: string }) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.error ?? "error desconocido"}`);
                return body;
              });
            })
            .then(({ text }: { text?: string }) => {
              console.log("[Transcribe] result:", text);
              if (text?.trim()) {
                onResultRef.current(text.trim());
              } else {
                throw new Error("Transcripción vacía");
              }
            })
            .catch((err: Error) => {
              clearTimeout(timeout);
              const msg = err.name === "AbortError"
                ? "La transcripción tardó demasiado. Intenta de nuevo."
                : `Error al transcribir: ${err.message}`;
              console.error("[Transcribe]", msg);
              onErrorRef.current?.(msg);
            })
            .finally(() => setTranscribing(false));
        };

        recorder.start();
        setRecording(true);
      })
      .catch((err) => console.error("[Mic] getUserMedia:", err));
  }, [recording, transcribing]);

  const stop = useCallback(() => {
    if (!recorderRef.current || !recording) return;
    recorderRef.current.stop();
    setRecording(false);
  }, [recording]);

  const toggle = useCallback(() => {
    if (recording) stop();
    else start();
  }, [recording, start, stop]);

  return { recording, transcribing, supported, toggle };
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
