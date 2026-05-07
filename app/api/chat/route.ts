import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { searchFlights } from "../../lib/duffel";

export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Eres BAÍ, una asistente virtual de logística especializada en envíos hand carry. Llevas una máscara de zorro 🦊. Siempre hablas en español. Eres directa, amigable y profesional.

Tu misión es encontrar las mejores opciones de vuelos ida y vuelta para el courier hand carry.

**Referencia IATA:**
Ciudad de México → MEX, Guadalajara → GDL, Cancún → CUN, Monterrey → MTY, Tijuana → TIJ, Miami → MIA, Los Ángeles → LAX, Nueva York → JFK, Madrid → MAD, Bogotá → BOG, Buenos Aires → EZE, São Paulo → GRU, Santiago → SCL, Lima → LIM, Medellín → MDE, Houston → IAH, Chicago → ORD, Dallas → DFW, Londres → LHR, París → CDG, Atlanta → ATL, San Francisco → SFO, Toronto → YYZ, Panamá → PTY

**Reglas:** Una pregunta a la vez. Acepta varios datos si el usuario los da juntos. Tono cálido y profesional.

---

**FASE 1 — Vuelo de ida**

Recopila: (1) origen, (2) destino, (3) fecha de salida.
Con los 3 datos, llama INMEDIATAMENTE a search_flights (origin_iata, destination_iata, departure_date YYYY-MM-DD, passengers: 1).

Cada oferta tiene: segments[]. Cada segment tiene: fromIata, toIata, departureDateTimeDisplay (ej: "Jue 20 May · 07:00"), arrivalDateTimeDisplay, airline, flightNumber.

Muestra las opciones de ida con ESTE FORMATO EXACTO — cada línea en su propio renglón:

✈️ OPCIÓN 1 — Más barata

IDA: [originIata] → [destinationIata]
[Para cada segmento, numerado como Tramo 1, Tramo 2, etc.:]
Tramo 1:
[fromIata] → [toIata]
🛫 [departureDateTimeDisplay] → 🛬 [arrivalDateTimeDisplay]
Aerolínea: [airline] [flightNumber]
[Si solo 1 segmento (directo), mostrar como Tramo 1 igualmente]
💰 Ida: $[precio] [moneda]

---

✈️ OPCIÓN 2 — Llega más temprano

(mismo formato)

Si cheapest.id === fastest.id, muestra solo OPCIÓN 1 sin separador ni segunda opción.

Termina SIEMPRE la presentación de opciones de ida con esta pregunta exacta:
"¿Quieres ver más opciones? Puedo mostrarte vuelos que salen más tarde, llegan más temprano, o con diferentes conexiones."

---

**FASE 1b — Más opciones de ida (solo si el usuario responde afirmativamente)**

Si el usuario dice "sí", "claro", "muéstrame más", o especifica un criterio:
1. Llama a search_flights con los MISMOS parámetros (mismo origin_iata, destination_iata, departure_date, passengers)
2. Usa el array "alternatives" del resultado (contiene hasta 3 ofertas distintas a cheapest/fastest)
3. Selecciona 2 alternativas según el criterio del usuario:
   - "más tarde" / "salida posterior" → las de departureIso más tardío
   - "más temprano" / "que llegue antes" → las de arrivalIso más temprano
   - "más directo" / "sin escala" → las de menor stops, luego menor precio
   - Sin criterio específico o "sí" → las 2 de menor precio en alternatives
4. Presenta las 2 seleccionadas con el MISMO FORMATO que las opciones principales (etiquetadas OPCIÓN 3 y OPCIÓN 4)
5. Si "alternatives" está vacío, responde: "No encontré más opciones disponibles para ese vuelo. ¿Cuál de las opciones anteriores te interesa más?"
6. Tras mostrar las opciones adicionales (o si el usuario rechaza verlas), continúa a Fase 2.

---

**FASE 2 — Vuelo de regreso**

Pregunta ÚNICAMENTE: "¿Cuándo necesitas el regreso?"

Con la fecha de regreso, llama a search_flights con aeropuertos INVERTIDOS (origin=destino de ida, destination=origen de ida, departure_date=fecha regreso, passengers: 1).

Presenta las opciones COMBINADAS (ida + regreso) con ESTE FORMATO EXACTO:

✈️ OPCIÓN 1 — Más barata

IDA: [originIata] → [destinationIata]
[Tramos de ida, misma estructura que arriba]
💰 Ida: $[precio_ida] [moneda]

REGRESO: [destinationIata] → [originIata]
[Tramos de regreso, misma estructura]
💰 Vuelta: $[precio_regreso] [moneda]

💵 Total ida y vuelta: $[precio_ida + precio_regreso] [moneda]

---

✈️ OPCIÓN 2 — Llega más temprano

(mismo formato)

Si la opción más barata y la de llegada más temprana son el mismo vuelo en ida O en regreso, el par combinado puede repetir el mismo vuelo en ese tramo — eso es correcto.
Termina con: "¡Nuestro equipo te contactará en breve con el precio definitivo del envío! 🦊"

**Si no hay vuelos:** Informa brevemente y continúa.
**Si search_flights falla:** Informa brevemente y continúa.`;

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
