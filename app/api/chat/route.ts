import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { searchFlights } from "../../lib/duffel";
import { SYSTEM_PROMPT } from "./prompt";

export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SEARCH_FLIGHTS_TOOL: Anthropic.Tool = {
  name: "search_flights",
  description:
    "Busca vuelos disponibles para el courier de hand carry entre dos aeropuertos. Llamar solo cuando se tengan los 7 datos de la cotización completos.",
  input_schema: {
    type: "object" as const,
    properties: {
      origin_iata: {
        type: "string",
        description: "Código IATA del aeropuerto de origen (ej: GDL, MEX, CUN)",
      },
      destination_iata: {
        type: "string",
        description: "Código IATA del aeropuerto de destino",
      },
      departure_date: {
        type: "string",
        description: "Fecha de salida en formato YYYY-MM-DD",
      },
      passengers: {
        type: "integer",
        description: "Número de couriers/pasajeros (1 o 2)",
      },
    },
    required: ["origin_iata", "destination_iata", "departure_date", "passengers"],
  },
};

const MODEL = "claude-sonnet-4-6";

function buildSystemBlock(): Anthropic.TextBlockParam {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return {
    type: "text",
    text: `Fecha de hoy: ${today}. Las fechas de envío deben ser posteriores a hoy.\n\n${SYSTEM_PROMPT}`,
    cache_control: { type: "ephemeral" },
  };
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const readable = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();

        async function runTurn(msgs: Anthropic.MessageParam[]): Promise<void> {
          const stream = client.messages.stream({
            model: MODEL,
            max_tokens: 2048,
            system: [buildSystemBlock()],
            tools: [SEARCH_FLIGHTS_TOOL],
            messages: msgs,
          });

          stream.on("text", (text) => {
            controller.enqueue(enc.encode(text));
          });

          const finalMsg = await stream.finalMessage();

          if (finalMsg.stop_reason !== "tool_use") return;

          // Handle ALL tool_use blocks — Claude may call search_flights multiple times
          // in one response (e.g. outbound + return in the same turn)
          const toolBlocks = finalMsg.content.filter(
            (b): b is Anthropic.ToolUseBlock =>
              b.type === "tool_use" && b.name === "search_flights"
          );

          if (!toolBlocks.length) return;

          // Execute all tool calls in parallel, collect all results
          const toolResults = await Promise.all(
            toolBlocks.map(async (toolBlock) => {
              const input = toolBlock.input as {
                origin_iata: string;
                destination_iata: string;
                departure_date: string;
                passengers: number;
              };

              let content: string;
              try {
                console.log(
                  `[Duffel] Searching ${input.origin_iata} → ${input.destination_iata} on ${input.departure_date}`
                );
                const flights = await searchFlights({
                  origin: input.origin_iata,
                  destination: input.destination_iata,
                  date: input.departure_date,
                  passengers: input.passengers ?? 1,
                });
                console.log(
                  `[Duffel] Found ${flights.totalOffers} offers for ${input.origin_iata} → ${input.destination_iata}`
                );
                content = JSON.stringify(flights);
              } catch (err) {
                console.error(
                  `[Duffel] Error for ${input.origin_iata} → ${input.destination_iata}:`,
                  err
                );
                content = JSON.stringify({ error: String(err) });
              }

              return {
                type: "tool_result" as const,
                tool_use_id: toolBlock.id,
                content,
              };
            })
          );

          // Return ALL tool results in a single user message (required by the API)
          await runTurn([
            ...msgs,
            { role: "assistant", content: finalMsg.content },
            { role: "user", content: toolResults },
          ]);
        }

        try {
          await runTurn(messages);
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[BAÍ API]", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
