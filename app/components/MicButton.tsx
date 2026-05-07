"use client";

interface MicButtonProps {
  listening: boolean;
  speaking: boolean;
  supported: boolean;
  onToggle: () => void;
}

function WaveIcon() {
  return (
    <div className="flex items-center justify-center gap-[3px] h-5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="wave-bar w-[3px] rounded-full bg-[#C44070]"
          style={{ height: "100%" }}
        />
      ))}
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="20" x2="12" y2="23" />
      <line x1="9" y1="23" x2="15" y2="23" />
    </svg>
  );
}

export default function MicButton({ listening, speaking, supported, onToggle }: MicButtonProps) {
  if (!supported) return null;

  return (
    <div className={`relative flex-shrink-0 ${listening ? "mic-active" : ""}`}>
      {listening && (
        <span className="pulse-ring absolute inset-0 rounded-full border-2 border-[#F4A7B9] pointer-events-none" />
      )}
      <button
        onClick={onToggle}
        disabled={speaking}
        aria-label={listening ? "Detener grabación" : "Hablar"}
        className={`
          pulse-dot relative z-10 w-14 h-14 rounded-full flex items-center justify-center
          transition-all duration-200 active:scale-95
          ${listening
            ? "bg-[#F4A7B9]/35 text-[#C44070] border-2 border-[#F4A7B9]/70 pink-glow"
            : "bg-white/50 text-[#7B74A0] border border-[#B8A9D9]/50 hover:bg-white/70 hover:border-[#B8A9D9]/80"
          }
          ${speaking ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        {listening ? <WaveIcon /> : <MicIcon />}
      </button>
    </div>
  );
}
