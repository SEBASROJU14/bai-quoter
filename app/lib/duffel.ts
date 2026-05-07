export interface FlightSegment {
  fromIata: string;
  fromCity: string;
  toIata: string;
  toCity: string;
  departureDateTimeDisplay: string; // "Jue 20 May · 07:00"
  arrivalDateTimeDisplay: string;   // "Jue 20 May · 08:10"
  airline: string;
  airlineCode: string;
  flightNumber: string;
}

export interface FlightOffer {
  id: string;
  originIata: string;
  destinationIata: string;
  departureIso: string;  // "2026-05-20T07:00:00" — first segment departure, for sorting
  arrivalIso: string;    // "2026-05-20T14:42:00" — last segment arrival, for sorting
  durationLabel: string;
  durationMinutes: number;
  stops: number;
  price: number;
  currency: string;
  segments: FlightSegment[];
}

export interface FlightSearchResult {
  cheapest: FlightOffer | null;
  fastest: FlightOffer | null;       // earliest arrival at final destination
  alternatives: FlightOffer[];       // up to 3 additional offers, excluding cheapest/fastest
  totalOffers: number;
}

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Duffel returns local airport time without timezone — parse manually to avoid UTC shift
function formatDateTime(iso: string): string {
  const [datePart, timePart] = iso.split("T");
  if (!datePart || !timePart) return iso;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const d = new Date(year, month - 1, day);
  const dayName = DAYS_ES[d.getDay()];
  const monthName = MONTHS_ES[month - 1];
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${dayName} ${day} ${monthName} · ${hh}:${mm}`;
}

function parseDurationMinutes(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 9999;
  return (parseInt(m[1] ?? "0") * 60) + parseInt(m[2] ?? "0");
}

function formatDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return iso;
  const parts: string[] = [];
  if (m[1]) parts.push(`${m[1]}h`);
  if (m[2]) parts.push(`${m[2]}min`);
  return parts.join(" ") || iso;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cityName(place: any): string {
  return place?.city_name || place?.name || place?.iata_code || "?";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOffer(offer: any): FlightOffer {
  const slice = offer.slices[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSegs: any[] = slice.segments;
  const first = rawSegs[0];
  const last = rawSegs[rawSegs.length - 1];

  const segments: FlightSegment[] = rawSegs.map((seg) => ({
    fromIata: seg.origin.iata_code,
    fromCity: cityName(seg.origin),
    toIata: seg.destination.iata_code,
    toCity: cityName(seg.destination),
    departureDateTimeDisplay: formatDateTime(seg.departing_at),
    arrivalDateTimeDisplay: formatDateTime(seg.arriving_at),
    airline: seg.marketing_carrier.name,
    airlineCode: seg.marketing_carrier.iata_code,
    flightNumber: `${seg.marketing_carrier.iata_code}-${seg.marketing_carrier_flight_number}`,
  }));

  return {
    id: offer.id,
    originIata: first.origin.iata_code,
    destinationIata: last.destination.iata_code,
    departureIso: first.departing_at,
    arrivalIso: last.arriving_at,
    durationLabel: formatDuration(slice.duration),
    durationMinutes: parseDurationMinutes(slice.duration),
    stops: rawSegs.length - 1,
    price: parseFloat(offer.total_amount),
    currency: offer.total_currency,
    segments,
  };
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // Retry on network/timeout errors; do NOT retry on 4xx validation errors
  return (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("socket") ||
    msg.includes("duffel api 5")
  );
}

async function fetchFlights(params: {
  origin: string;
  destination: string;
  date: string;
  passengers: number;
}): Promise<FlightSearchResult> {
  const apiKey = process.env.DUFFEL_API_KEY;
  if (!apiKey) throw new Error("DUFFEL_API_KEY no configurado");

  const passengerCount = Math.max(1, Math.round(params.passengers));
  const passengers = Array.from({ length: passengerCount }, () => ({ type: "adult" }));

  const res = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      data: {
        slices: [
          {
            origin: params.origin.trim().toUpperCase(),
            destination: params.destination.trim().toUpperCase(),
            departure_date: params.date,
          },
        ],
        passengers,
        cabin_class: "economy",
      },
    }),
  });

  const rawText = await res.text();

  if (!res.ok) {
    console.error("[Duffel]", res.status, rawText);
    throw new Error(`Duffel API ${res.status}: ${rawText}`);
  }

  const json = JSON.parse(rawText);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawOffers: any[] = json.data?.offers ?? [];

  if (!rawOffers.length) {
    return { cheapest: null, fastest: null, alternatives: [], totalOffers: 0 };
  }

  const offers = rawOffers.map(mapOffer);
  const cheapest = [...offers].sort((a, b) => a.price - b.price)[0];
  // "fastest" = earliest arrival at final destination (ISO string sorts correctly)
  const fastest = [...offers].sort((a, b) => a.arrivalIso.localeCompare(b.arrivalIso))[0];

  const shownIds = new Set([cheapest.id, fastest.id]);
  const alternatives = offers
    .filter((o) => !shownIds.has(o.id))
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);

  return { cheapest, fastest, alternatives, totalOffers: offers.length };
}

export async function searchFlights(params: {
  origin: string;
  destination: string;
  date: string;
  passengers: number;
}): Promise<FlightSearchResult> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetchFlights(params);
    } catch (err) {
      lastErr = err;
      const retryable = isRetryable(err);
      console.error(
        `[Duffel] Attempt ${attempt}/${RETRY_ATTEMPTS} failed for ${params.origin} → ${params.destination}:`,
        err
      );
      if (!retryable || attempt === RETRY_ATTEMPTS) break;
      console.log(`[Duffel] Retrying in ${RETRY_DELAY_MS}ms...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  throw lastErr;
}
