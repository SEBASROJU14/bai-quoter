"use client";

interface FoxAvatarProps {
  speaking?: boolean;
  size?: number;
}

export default function FoxAvatar({ speaking = false, size = 40 }: FoxAvatarProps) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className={`w-full h-full rounded-full overflow-hidden transition-all duration-300 ${
          speaking
            ? "ring-2 ring-[#F4A7B9] ring-offset-1 ring-offset-[#2D2B3D] shadow-[0_0_16px_rgba(244,167,185,0.55)]"
            : ""
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bai-avatar.png"
          alt="BAÍ"
          width={size}
          height={size}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
      {speaking && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F4A7B9] opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#F4A7B9]" />
        </span>
      )}
    </div>
  );
}
