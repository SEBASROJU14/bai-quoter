"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#B8A9D9]/20 border-b border-[#B8A9D9]/30 text-xs flex-shrink-0">
      <span className="text-[#2A2438]">Instala BAÍ en tu dispositivo</span>
      <div className="flex gap-2">
        <button
          onClick={() => setVisible(false)}
          className="text-[#7B74A0] hover:text-[#2A2438] px-2 py-1 transition-colors"
        >
          Ahora no
        </button>
        <button
          onClick={install}
          className="bg-[#F4A7B9] text-[#2D2B3D] px-3 py-1 rounded-full font-semibold hover:opacity-90 transition-opacity"
        >
          Instalar
        </button>
      </div>
    </div>
  );
}
