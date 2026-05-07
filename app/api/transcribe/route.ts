import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[Transcribe] OPENAI_API_KEY is not set");
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let audioFile: File | null = null;

  try {
    const body = await req.formData();
    audioFile = body.get("audio") as File | null;

    if (!audioFile || audioFile.size === 0) {
      console.error("[Transcribe] No audio in request or empty file");
      return NextResponse.json({ error: "No audio received" }, { status: 400 });
    }

    const filename = audioFile.name ?? "recording.webm";
    console.log(`[Transcribe] received — name: ${filename}, size: ${audioFile.size} bytes, type: ${audioFile.type}`);

    const form = new FormData();
    form.append("file", audioFile, filename);
    form.append("model", "whisper-1");
    form.append("language", "es");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const rawBody = await res.text();
    console.log(`[Whisper] status: ${res.status}, body: ${rawBody.slice(0, 300)}`);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Whisper ${res.status}: ${rawBody.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const { text } = JSON.parse(rawBody) as { text: string };
    console.log(`[Whisper] transcript: "${text}"`);
    return NextResponse.json({ text });

  } catch (err) {
    console.error("[Transcribe] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
