import { NextRequest } from "next/server";
import { searchFlights } from "../../lib/duffel";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { origin, destination, date, passengers = 1 } = body;

    if (!origin || !destination || !date) {
      return new Response(
        JSON.stringify({ error: "Se requieren: origin (IATA), destination (IATA), date (YYYY-MM-DD)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await searchFlights({
      origin,
      destination,
      date,
      passengers: Number(passengers),
    });

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[flights]", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
