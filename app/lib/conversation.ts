export type ConversationStep =
  | "greeting"
  | "origin"
  | "destination"
  | "eta_date"
  | "eta_time"
  | "boxes"
  | "weight"
  | "dimensions"
  | "summary"
  | "done";

export interface QuoteData {
  origin?: string;
  destination?: string;
  etaDate?: string;
  etaTime?: string;
  boxes?: number;
  weightPerBox?: number;
  dimensions?: { length: number; width: number; height: number };
}

export interface ConversationState {
  step: ConversationStep;
  data: QuoteData;
}

const GREETINGS = [
  "¡Hola! Soy BAÍ, tu asistente de logística. 🦊 Estoy aquí para ayudarte a cotizar tu envío de forma rápida y sencilla.\n\n¿Desde qué ciudad sale tu carga?",
];

export function getInitialState(): ConversationState {
  return { step: "origin", data: {} };
}

export function getGreeting(): string {
  return GREETINGS[0];
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, ".").match(/[\d.]+/);
  if (!cleaned) return null;
  const n = parseFloat(cleaned[0]);
  return isNaN(n) ? null : n;
}

function parseDate(text: string): string | null {
  const lower = text.toLowerCase().trim();
  const today = new Date();

  // "hoy"
  if (lower.includes("hoy")) {
    return today.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  // "mañana"
  if (lower.includes("mañana") || lower.includes("manana")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const dateMatch = lower.match(/(\d{1,2})[\/\-\s](\d{1,2})(?:[\/\-\s](\d{2,4}))?/);
  if (dateMatch) {
    const d = dateMatch[1].padStart(2, "0");
    const m = dateMatch[2].padStart(2, "0");
    const y = dateMatch[3]
      ? dateMatch[3].length === 2
        ? "20" + dateMatch[3]
        : dateMatch[3]
      : today.getFullYear().toString();
    return `${d}/${m}/${y}`;
  }
  // Try to detect named months
  const months: Record<string, string> = {
    enero: "01", febrero: "02", marzo: "03", abril: "04",
    mayo: "05", junio: "06", julio: "07", agosto: "08",
    septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
  };
  for (const [name, num] of Object.entries(months)) {
    if (lower.includes(name)) {
      const dayMatch = lower.match(/(\d{1,2})/);
      if (dayMatch) {
        return `${dayMatch[1].padStart(2, "0")}/${num}/${today.getFullYear()}`;
      }
    }
  }
  if (lower.length > 2) return lower; // keep raw text
  return null;
}

function parseTime(text: string): string | null {
  const lower = text.toLowerCase().trim();
  // HH:MM pattern
  const timeMatch = lower.match(/(\d{1,2})[:\s](\d{2})\s?(am|pm|hrs?)?/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const min = timeMatch[2];
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:${min}`;
  }
  // Plain hour
  const hourMatch = lower.match(/(\d{1,2})\s?(am|pm|hrs?|horas?)?/i);
  if (hourMatch) {
    let h = parseInt(hourMatch[1]);
    const ampm = hourMatch[2]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:00`;
  }
  if (lower.length > 1) return lower;
  return null;
}

function parseDimensions(text: string): { length: number; width: number; height: number } | null {
  const nums = text.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return {
      length: parseFloat(nums[0]),
      width: parseFloat(nums[1]),
      height: parseFloat(nums[2]),
    };
  }
  return null;
}

function buildSummary(data: QuoteData): string {
  const dims = data.dimensions
    ? `${data.dimensions.length}×${data.dimensions.width}×${data.dimensions.height} cm`
    : "—";

  return `¡Perfecto! Aquí está el resumen de tu cotización:\n\n` +
    `📦 *Origen:* ${data.origin}\n` +
    `📍 *Destino:* ${data.destination}\n` +
    `🗓️ *ETA:* ${data.etaDate} a las ${data.etaTime}\n` +
    `📫 *Cajas:* ${data.boxes}\n` +
    `⚖️ *Peso por caja:* ${data.weightPerBox} kg\n` +
    `📐 *Dimensiones:* ${dims}\n\n` +
    `Estoy procesando tu cotización... En breve tendrás el precio. ¿Hay algo más que quieras ajustar?`;
}

export function processMessage(
  input: string,
  state: ConversationState
): { reply: string; newState: ConversationState } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { reply: "No escuché nada. ¿Puedes repetirlo?", newState: state };
  }

  const data = { ...state.data };
  let nextStep: ConversationStep = state.step;
  let reply = "";

  switch (state.step) {
    case "origin": {
      data.origin = trimmed;
      nextStep = "destination";
      reply = `¡Entendido! Salida desde *${trimmed}*. 🚚\n\n¿A qué ciudad va la carga?`;
      break;
    }

    case "destination": {
      data.destination = trimmed;
      nextStep = "eta_date";
      reply = `Destino: *${trimmed}*. 📍\n\n¿Para qué fecha necesitas que llegue? (puedes decir "hoy", "mañana", o una fecha como 15/05/2025)`;
      break;
    }

    case "eta_date": {
      const date = parseDate(trimmed);
      if (!date) {
        reply = `No pude entender la fecha. Por favor dime algo como "15 de mayo", "15/05/2025" o "mañana".`;
        break;
      }
      data.etaDate = date;
      nextStep = "eta_time";
      reply = `Fecha de entrega: *${date}*. 🗓️\n\n¿A qué hora debe llegar? (ejemplo: "10am", "14:30")`;
      break;
    }

    case "eta_time": {
      const time = parseTime(trimmed);
      if (!time) {
        reply = `No pude entender la hora. Intenta con "10am", "2pm" o "14:30".`;
        break;
      }
      data.etaTime = time;
      nextStep = "boxes";
      reply = `Hora de llegada: *${time}*. ⏰\n\n¿Cuántas cajas vas a enviar?`;
      break;
    }

    case "boxes": {
      const n = parseNumber(trimmed);
      if (!n || n <= 0) {
        reply = `No pude entender el número de cajas. Por favor dime solo el número, por ejemplo "10".`;
        break;
      }
      data.boxes = Math.round(n);
      nextStep = "weight";
      reply = `${data.boxes} ${data.boxes === 1 ? "caja" : "cajas"}. 📦\n\n¿Cuánto pesa cada caja? (en kilogramos)`;
      break;
    }

    case "weight": {
      const w = parseNumber(trimmed);
      if (!w || w <= 0) {
        reply = `No pude entender el peso. Dime el peso en kg, por ejemplo "5.5".`;
        break;
      }
      data.weightPerBox = w;
      nextStep = "dimensions";
      reply = `*${w} kg* por caja. ⚖️\n\n¿Cuáles son las dimensiones de cada caja?\nDime largo × ancho × alto en centímetros.\n(ejemplo: "40 x 30 x 25")`;
      break;
    }

    case "dimensions": {
      const dims = parseDimensions(trimmed);
      if (!dims) {
        reply = `No pude entender las dimensiones. Por favor dime largo, ancho y alto separados, por ejemplo "40 x 30 x 25".`;
        break;
      }
      data.dimensions = dims;
      nextStep = "done";
      reply = buildSummary(data);
      break;
    }

    case "done": {
      reply = `Tu cotización ya fue registrada. Si quieres hacer una nueva, recarga la página o dime "nueva cotización". 🦊`;
      break;
    }

    default:
      reply = `Disculpa, ocurrió algo inesperado. ¿Puedes repetir?`;
  }

  return { reply, newState: { step: nextStep, data } };
}
