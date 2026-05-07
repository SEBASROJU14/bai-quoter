import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.formData();
    const audio = body.get("audio") as Blob | null;

    if (!audio || audio.size === 0) {
      return NextResponse.json({ error: "No audio received" }, { status: 400 });
    }

    const filename = (body.get("audio") as File)?.name ?? "recording.webm";

    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", "whisper-1");
    form.append("language", "es");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Whisper]", res.status, err);
      return NextResponse.json({ error: "Whisper API error" }, { status: 502 });
    }

    const { text } = await res.json() as { text: string };
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[Transcribe]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
