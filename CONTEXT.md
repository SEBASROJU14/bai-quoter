# BAÍ Quoter — Context for Claude Code Sessions

Chatbot de logística hand carry. BAÍ es una asistente virtual con máscara de zorro que cotiza envíos buscando vuelos reales con Duffel. Todo el UI es en español. Deploy en Vercel. Repo: `github.com/SEBASROJU14/bai-quoter`.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 16.2.5** (App Router) — versión con breaking changes, leer `node_modules/next/dist/docs/` ante cualquier duda |
| UI | React 19, TypeScript, Tailwind CSS v4 |
| Font | Plus Jakarta Sans (Google Fonts, pesos 400/500/600/700) |
| AI | Anthropic SDK (`@anthropic-ai/sdk ^0.95`) — `claude-sonnet-4-6` |
| Vuelos | Duffel API v2 — raw fetch, `POST /air/offer_requests?return_offers=true` |
| Voz entrada | MediaRecorder API (cliente) + OpenAI Whisper (`whisper-1`) — raw fetch |
| Voz salida | Web Speech API (`SpeechSynthesisUtterance`) — TTS client-side |
| Markdown | `react-markdown ^10` + `remark-breaks ^4` |
| IDs | `uuid ^14` |
| PWA | Service worker manual (`/public/sw.js`), `manifest.json` |
| Deploy | Vercel (función serverless, `maxDuration = 60`) |

### Variables de entorno requeridas
```
ANTHROPIC_API_KEY   # para /api/chat (Claude)
OPENAI_API_KEY      # para /api/transcribe (Whisper)
DUFFEL_API_KEY      # para búsqueda de vuelos reales
```

---

## Estructura de archivos

```
app/
  page.tsx                        # Raíz — solo renderiza <Chat />
  layout.tsx                      # Metadata, viewport, PWA tags, ServiceWorkerRegistrar
  globals.css                     # Variables CSS, bubble styles, animaciones mic/typing/wave
  favicon.ico

  components/
    Chat.tsx                      # Componente principal — orquesta toda la UI y lógica
    ChatInput.tsx                 # Textarea + botón enviar + MicButton integrado
    MicButton.tsx                 # Botón grabación (idle/recording/transcribing states)
    Message.tsx                   # Bubble BAÍ (react-markdown) o usuario + TypingIndicator
    FoxAvatar.tsx                 # Avatar circular con ring+glow cuando habla TTS
    InstallPrompt.tsx             # Banner PWA install (beforeinstallprompt)
    ServiceWorkerRegistrar.tsx    # Registra /public/sw.js en mount

  hooks/
    useSpeech.ts                  # useMediaRecorder (grabación+Whisper) + useTTS (TTS)

  api/
    chat/
      route.ts                    # Streaming SSE con Anthropic SDK + tool use recursivo
      prompt.ts                   # SYSTEM_PROMPT como array.join('\n') — sin template literal

    transcribe/
      route.ts                    # Recibe FormData con audio, llama Whisper, retorna {text}

    flights/
      route.ts                    # Endpoint de debug/test — NO usa la UI, solo para pruebas manuales

  lib/
    duffel.ts                     # searchFlights() con retry + mapOffer() + FlightOffer types
    conversation.ts               # LEGACY — máquina de estados rule-based, ya NO se usa

public/
  bai-avatar.png                  # Fuente maestra del ícono (1254×1254 PNG)
  icons/
    icon-192.png                  # PWA Android
    icon-512.png                  # PWA splash
    apple-touch-icon.png          # iOS 180×180
  sw.js                           # Service worker: cache-first para assets estáticos
  manifest.json                   # PWA manifest
```

---

## Paleta de colores (CSS variables en globals.css)

```css
--bg:            #C8E6F5   /* fondo principal — azul claro */
--surface:       #B0D5EC   /* header, input bar */
--surface-input: rgba(255,255,255,0.65)
--pink:          #F4A7B9   /* botón enviar, acento rosa */
--lavender:      #B8A9D9   /* detalles, bordes */
--text:          #2A2438   /* texto principal */
--text-dim:      #7B74A0   /* texto secundario */
```

---

## Features implementadas

### 1. Chat conversacional con streaming
- `Chat.tsx` acumula mensajes y hace streaming chunk a chunk desde `/api/chat`
- El texto de BAÍ se renderiza progresivamente con `react-markdown` + `remark-breaks`
- `abortRef` cancela requests en vuelo si el usuario manda otro mensaje
- Greeting hardcodeado (sin latencia): aparece 600ms después de montar
- Botón de reset en header — reinicia conversación y reproduce greeting

### 2. Tool use con Duffel (búsqueda de vuelos reales)
- Claude tiene acceso a la herramienta `search_flights` (parámetros: `origin_iata`, `destination_iata`, `departure_date`, `passengers`)
- `runTurn()` en `route.ts` es **recursivo**: si `stop_reason === "tool_use"`, ejecuta las herramientas y llama a sí misma con los resultados
- Claude puede emitir **múltiples bloques `tool_use`** en un turno (ej: ida y vuelta simultáneamente) — se manejan con `filter()` + `Promise.all` en paralelo
- Todos los resultados se devuelven en un único mensaje `user` con array de `tool_result`
- `searchFlights` retorna: `cheapest`, `fastest` (por arrival ISO), `alternatives` (hasta 3 extra)
- Retry automático en Duffel: 3 intentos, 2s de espera, solo errores de red/5xx (no 4xx)

### 3. Conversación guiada por fases (system prompt)
El prompt en `prompt.ts` define:
- **FASE 1**: recopila origen, destino, fecha de salida → llama `search_flights` → muestra OPCION 1 (más barata) y OPCION 2 (llega más temprano) → pregunta si quiere más opciones
- **FASE 1b**: si el usuario dice que sí → vuelve a llamar `search_flights` con mismos params → usa array `alternatives` → muestra OPCION 3 y 4 con criterio del usuario
- **FASE 2**: pregunta fecha de regreso → llama `search_flights` con aeropuertos invertidos → muestra opciones combinadas ida+vuelta con totales

### 4. "Llega más temprano" vs "más rápida"
- La opción rápida se calcula por **arrival ISO** del último segmento (`arrivalIso.localeCompare()`), no por duración total del vuelo
- Esto garantiza que "llega más temprano" sea literalmente el vuelo que llega antes, incluso si tiene más horas de vuelo (por diferencias de zona horaria o conexiones)

### 5. Voz de entrada — MediaRecorder + Whisper
- `useMediaRecorder` en `useSpeech.ts` — reemplazó Web Speech API por incompatibilidad con iOS Safari
- MIME type detection: `webm;codecs=opus` → `webm` → `mp4` → `ogg`
- Extensión: `mp4 → .m4a` (Whisper en iOS requiere `.m4a`, no `.mp4`)
- Guard de tamaño: blob < 1000 bytes → descarta sin enviar
- Timeout 25s con `AbortController` — previene "Transcribiendo..." eterno
- Errores superficiados al usuario como mensaje de BAÍ (con `⚠️`)
- El `toggle()` del mic cancela TTS si está hablando

### 6. Voz de salida — TTS
- `useTTS` en `useSpeech.ts` — usa `SpeechSynthesisUtterance`
- `splitSentences()` divide el texto en chunks ≤140 chars (Chrome pausa utterances largas)
- Keepalive: interval de 10s hace `pause()+resume()` para que Chrome no duerma la síntesis en background
- Voz preferida: Google ES → cualquier ES → default
- `lang: "es-MX"`, `rate: 1.05`, `pitch: 1.1`
- `FoxAvatar` muestra ring rosa + punto pulsante cuando `speaking === true`

### 7. PWA
- Service worker cache-first para assets; excluye `/api/`
- `InstallPrompt` captura `beforeinstallprompt` y muestra banner de instalación
- Iconos generados con `sips` desde `bai-avatar.png` (1254×1254): 192, 512, 180px
- `themeColor: "#B0D5EC"` en `viewport` export y en `manifest.json`
- iOS: `apple-touch-icon` 180×180, `apple-mobile-web-app-status-bar-style: black-translucent`

### 8. Prompt caching
- El system block tiene `cache_control: { type: "ephemeral" }` — Anthropic cachea el prompt entre requests
- `buildSystemBlock()` inyecta la fecha de hoy al inicio para que Claude sepa qué fechas son válidas

---

## Decisiones de diseño

**¿Por qué `prompt.ts` como `array.join('\n')` y no template literal?**
El system prompt contiene la palabra `` `alternatives` `` entre backticks en el texto. Un backtick dentro de un template literal cierra el string prematuramente. Intentar escaparlo en el contexto de Vercel/SWC causó errores de parsing ("Expected a semicolon") que persistían incluso después de corregirlos localmente. La solución fue mover el prompt a un módulo separado usando `[...].join('\n')`, eliminando completamente la posibilidad de conflicto.

**¿Por qué Turbopack deshabilitado?**
Causaba errores de build en Vercel. `next.config.ts` tiene `const nextConfig: NextConfig = {}` (sin `turbopack: {}`).

**¿Por qué `maxDuration = 60` en `/api/chat`?**
Vercel tiene un límite de 10s por defecto en funciones serverless. Las búsquedas de Duffel + streaming de Claude pueden tomar 15-30s. `export const maxDuration = 60` sube el límite a 60s (requiere plan Pro en Vercel).

**¿Por qué `conversation.ts` sigue en el repo?**
Es código legacy de la primera versión (máquina de estados rule-based, sin AI). Ya no se usa — la lógica de conversación la maneja Claude con el system prompt. Se mantiene por referencia histórica, se puede eliminar sin riesgo.

**¿Por qué `/api/flights/route.ts` existe?**
Endpoint de debug para probar Duffel directamente sin Claude: `POST /api/flights { origin, destination, date, passengers }`. No lo usa la UI.

**¿Por qué `useMediaRecorder` en lugar de Web Speech API?**
iOS Safari 14.5+ tiene MediaRecorder. Web Speech API en iOS es inconsistente: requiere que `start()` se llame sincrónicamente dentro del handler de un gesto del usuario, y aun así falla en muchos casos. Whisper en servidor es más confiable y tiene mejor precisión en español.

**¿Por qué `splitSentences` en TTS?**
Chrome pausa `speechSynthesis` después de ~15 segundos de utterance. Al dividir el texto en frases ≤140 chars y encadenarlas con `onend`, cada chunk es corto y el keepalive se activa entre ellos.

**¿Por qué `formatDateTime` parsea el ISO manualmente sin `new Date()`?**
Duffel devuelve timestamps locales sin timezone (ej: `"2026-05-20T07:00:00"`). Si se parsean con `new Date()`, el navegador los interpreta como UTC y los convierte a local, mostrando horas incorrectas. El parser manual extrae día/mes/hora directamente del string.

---

## Bugs resueltos y cómo

### Múltiples tool_use blocks no manejados
**Síntoma**: Cuando Claude busca vuelos de ida y vuelta en el mismo turno, emite dos bloques `tool_use`. El primero se ejecutaba; el segundo se ignoraba con `find()`.
**Fix**: Usar `filter()` + `Promise.all` para ejecutar todos los bloques en paralelo. Devolver todos los `tool_result` en un único mensaje de usuario.

### Input bloqueado después de respuesta de BAÍ
**Síntoma**: Después de que BAÍ terminaba de hablar (TTS), el textarea quedaba deshabilitado varios segundos.
**Fix**: El `disabled` del textarea incluía el estado `speaking` del TTS. Se eliminó — el textarea nunca se deshabilita, solo se deshabilita el botón de enviar cuando `inputBusy` (recording o transcribing).

### "Expected a semicolon" en Vercel (backtick en system prompt)
**Síntoma**: Build de Vercel fallaba en `app/api/chat/route.ts:59` aunque localmente compilaba bien.
**Fix**: El system prompt tenía `` `alternatives` `` (backtick-enclosed) dentro de un template literal. Mover el prompt a `prompt.ts` como `array.join('\n')` eliminó el template literal completamente.

### iOS Safari — micrófono no funcionaba con Web Speech API
**Síntoma**: En iOS, el micrófono no grababa o se silenciaba inmediatamente.
**Fix**: Reemplazar Web Speech API con MediaRecorder + Whisper. MediaRecorder funciona en iOS Safari 14.5+ y el audio se envía al servidor para transcripción.

### "Transcribiendo..." eterno en móvil
**Síntoma**: El blob se grababa pero `/api/transcribe` no respondía o fallaba silenciosamente.
**Fix**: 
1. AbortController con timeout de 25s en el cliente
2. `r.ok` check en la respuesta (`throw` si HTTP error)
3. Logs detallados en el servidor (tamaño, tipo, status de Whisper)
4. Errores superficiados como mensaje de BAÍ con `⚠️`

### `export const maxDuration` entre imports causaba error de parser
**Síntoma**: Vercel rechazaba el archivo con error de sintaxis.
**Fix**: Mover `export const maxDuration = 60` después de todos los imports (el parser de Next.js requiere que las re-exports estén al final del bloque de imports).

### Horas de vuelos incorrectas
**Síntoma**: Los horarios de Duffel se mostraban desfasados por la zona horaria.
**Fix**: Parsear el ISO string manualmente en `formatDateTime()` en lugar de usar `new Date()`, que aplica conversión de timezone al tratar el string como UTC.

---

## Commits importantes (git log)

```
4f475ad  feat: custom PWA icon from bai-avatar.png
0e33fd2  fix: surface transcription errors in chat UI        ← error handling Whisper
a80d8ca  feat: replace Web Speech API with MediaRecorder + Whisper  ← iOS fix crítico
a00ca1a  fix: iOS microphone support                         ← intento anterior (Web Speech)
8ab724f  fix: remove backtick from system prompt             ← fix parcial
5ab2ed5  fix: disable turbopack                              ← Vercel build fix
db9a387  fix: force redeploy with clean system prompt
1c14df1  fix: sintaxis route.ts
ba74edf  feat: BAÍ — asistente de logística hand carry con vuelos reales  ← commit principal
3e21063  Initial commit from Create Next App
```

**Nota**: Los commits relacionados con Duffel retry, "más opciones", "llega más temprano" y fixes de tool_use múltiple están incluidos dentro de `ba74edf` (se hicieron antes de inicializar git, o fueron squasheados en el push inicial).

---

## Próximos pasos pendientes

### Funcionales
- **Cotización final**: después de mostrar vuelos, BAÍ dice "nuestro equipo te contactará" — falta implementar envío real (email/WhatsApp/CRM)
- **Número de couriers**: el prompt asume `passengers: 1` siempre; el tool schema tiene el campo pero el prompt no lo recopila actualmente
- **Validación de fechas**: el sistema prompt dice que las fechas deben ser posteriores a hoy (se inyecta la fecha actual en `buildSystemBlock()`), pero no hay validación explícita si el usuario da una fecha pasada
- **Caché de búsquedas**: cada mensaje re-busca en Duffel aunque los params no cambien

### Técnicos
- **`OPENAI_API_KEY` en Vercel**: debe estar configurada para que Whisper funcione en producción
- **`DUFFEL_API_KEY` en Vercel**: esencial para búsqueda de vuelos
- **`ANTHROPIC_API_KEY` en Vercel**: para streaming de Claude
- **`conversation.ts`**: código legacy sin usar — puede eliminarse
- **`/api/flights/route.ts`**: endpoint de debug — considerar eliminar en producción o proteger con auth
- **Prompt caching**: verificar que el cache hit rate sea alto en Anthropic dashboard (el system prompt debe ser idéntico entre requests para que el cache funcione)

### Mejoras UX
- **Historial de conversación**: actualmente se pierde al recargar
- **Error de red**: si Duffel falla los 3 intentos, BAÍ informa pero no ofrece reintentar manualmente
- **Copiar cotización**: botón para copiar el resumen de vuelos al portapapeles
- **Modo oscuro**: el tema actual es completamente claro

---

## Patrones a recordar

**Streaming desde Next.js API Route**
```typescript
const readable = new ReadableStream({ async start(controller) { ... } });
return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
```
El cliente lee con `response.body.getReader()` + `decoder.decode(value, { stream: true })`.

**Tool use recursivo — patrón correcto**
```typescript
// Nunca usar find() — usar filter() para capturar TODOS los tool_use blocks
const toolBlocks = finalMsg.content.filter(
  (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "search_flights"
);
const toolResults = await Promise.all(toolBlocks.map(async (block) => { ... }));
// Devolver TODO en un único mensaje user
await runTurn([...msgs,
  { role: "assistant", content: finalMsg.content },
  { role: "user", content: toolResults },
]);
```

**MediaRecorder en iOS**
- Detectar MIME antes de instanciar el recorder
- `mp4 → .m4a` para Whisper
- `getUserMedia` debe llamarse sincrónicamente dentro del handler del gesto

**No usar template literals para strings con backticks**
Si el string contiene backticks (ej: mencionar código markdown), usar `array.join('\n')`.

**Fechas de Duffel — no usar `new Date(isoString)`**
Parsear manualmente: `iso.split("T")` → extraer partes → construir fecha con `new Date(year, month-1, day)` solo para `getDay()`.

**Tailwind v4 — sin config JS**
Los colores custom van como CSS variables en `:root` dentro de `globals.css`. No existe `tailwind.config.js`.
