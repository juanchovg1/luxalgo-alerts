# luxalgo-alerts

Pipeline local que escucha Order Blocks del indicador **LuxAlgo Smart Money Concepts** dibujados en TradingView Desktop y los envía como alertas a Telegram en tiempo real.

No modifica el indicador. No usa webhooks ni la cuenta paga de TradingView. No depende de extensiones de Chrome. Lee directamente las cajas (`box.new`) que el indicador dibuja en el chart, vía Chrome DevTools Protocol, usando el proyecto [tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp).

```
TradingView Desktop (LuxAlgo SMC)
   │  CDP :9222
   ▼
tradingview-mcp CLI  ──► poller (Node)  ──► server (Node)  ──► Telegram
```

## Requisitos

- **Windows / macOS / Linux**
- **Node.js 18+** (probado con Node 24)
- **TradingView Desktop** instalado, con suscripción válida (gratis sirve)
- **Indicador LuxAlgo Smart Money Concepts** agregado a tu chart
- **tradingview-mcp** clonado e instalado localmente
- **Telegram bot** propio (token de @BotFather) y tu chat ID

## Instalación

### 1. Clona este repo

```bash
git clone https://github.com/YOUR_USERNAME/luxalgo-alerts.git
cd luxalgo-alerts
```

### 2. Instala dependencias

```bash
cd server && npm install && cd ..
cd poller && npm install && cd ..
```

### 3. Instala tradingview-mcp

Si todavía no lo tenés:

```bash
git clone https://github.com/tradesdontlie/tradingview-mcp.git ~/tradingview-mcp
cd ~/tradingview-mcp
npm install
```

Anota la ruta absoluta a `src/cli/index.js` — la necesitás en el siguiente paso.

### 4. Configura tu bot de Telegram

1. En Telegram, busca **@BotFather** y mandale `/newbot`. Te entrega un token tipo `1234567890:ABCdef...`.
2. Para obtener tu chat ID, busca **@userinfobot** y mandale `/start`. Te devuelve un número (tu User ID).
3. **Importante:** abrí el chat con tu nuevo bot y mandale `/start` — sin esto Telegram bloquea los mensajes salientes del bot hacia tu cuenta.

### 5. Configura los `.env`

```bash
cp server/.env.example server/.env
cp poller/.env.example poller/.env
```

**`server/.env`:**

```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdef-tu_token_aqui
TELEGRAM_CHAT_ID=123456789
PORT=3000
```

**`poller/.env`:**

```env
TV_CLI=C:/Users/YOURNAME/tradingview-mcp/src/cli/index.js
ALERT_ENDPOINT=http://localhost:3000/alert
POLL_INTERVAL_MS=5000
COLOR_BULLISH=1298726656
COLOR_BEARISH=1292370175
WARMUP_SKIP=true
```

### 6. Arranca TradingView Desktop con CDP habilitado

En **Windows**:

```bat
%LOCALAPPDATA%\TradingView\TradingView.exe --remote-debugging-port=9222
```

O usá el script del repo de tradingview-mcp: `scripts/launch_tv_debug.bat`.

En **macOS / Linux** mirá las instrucciones del README de tradingview-mcp.

### 7. Verifica la conexión

Con TradingView Desktop abierto y tu chart de XAUUSD/SOLUSDT/etc con el indicador LuxAlgo:

```bash
node ~/tradingview-mcp/src/cli/index.js status
```

Tenés que ver `"cdp_connected": true` y el símbolo de tu chart.

### 8. Detecta los colores correctos para tu tema

LuxAlgo usa colores que pueden variar según tu tema o personalización. Hay que detectarlos contra tu chart:

```bash
cd poller
node index.js --inspect-colors
node analyze.js
```

`analyze.js` clasifica cada color como BULLISH (debajo del precio actual = soporte) o BEARISH (encima del precio = resistencia). Copiá los dos números ARGB en `poller/.env` (`COLOR_BULLISH` y `COLOR_BEARISH`).

> **Si tu chart no tiene OBs visibles arriba Y abajo del precio**, esperá a que aparezcan o cambiá a un símbolo más volátil (XAUUSD 1m suele tener bastantes).

### 9. Test del pipeline a Telegram

```bash
cd server
npm run test:telegram
```

Te debe llegar un mensaje a Telegram con un OB de prueba. Si no llega, revisá:
- Mandaste `/start` al bot.
- El chat ID es correcto.
- El token está bien copiado.

### 10. Arrancalo

**Windows:** doble-click `start.bat` (abre 2 ventanas, una por servicio).

**Mac/Linux:**

```bash
# terminal 1
cd server && node index.js

# terminal 2
cd poller && node index.js
```

Deberías ver en el poller:

```
luxalgo-alerts poller starting (interval=5000ms, dry-run=false)
connected to TradingView: BINANCE:SOLUSDT @ 1m
warmup: indexed N existing OBs (X bull / Y bear)
```

A partir de ahí, cada vez que el LuxAlgo dibuje un nuevo OB en tu chart, te llega a Telegram en máximo 5 segundos.

---

## Compartir alertas con otra persona (mismo bot, mismo chat o chats separados)

Hay 3 setups posibles:

### Opción A — Cada uno con su bot

Cada persona crea su propio bot en BotFather y configura su `server/.env` independientemente. Setups totalmente aislados.

### Opción B — Mismo bot, dos chats individuales

Una persona crea el bot, comparte el token con la otra. Cada uno mete el token en su `server/.env` con su propio `TELEGRAM_CHAT_ID`. Cada uno solo recibe las alertas que su poller detecta (de su chart de TradingView).

```env
TELEGRAM_BOT_TOKEN=token_compartido
TELEGRAM_CHAT_ID=tu_chat_id   # diferente para cada usuario
```

### Opción C — Grupo de Telegram con ambos + el bot

1. Crean un grupo en Telegram con ambos miembros.
2. Agregan el bot al grupo (Add member → buscar `@TuBotName_bot`).
3. Mandan un mensaje cualquiera en el grupo, después llaman a `https://api.telegram.org/bot<TOKEN>/getUpdates` y leen el `chat.id` (es un número negativo, ej `-1001234567890`).
4. En `server/.env` ponen ese ID en `TELEGRAM_CHAT_IDS`:

```env
TELEGRAM_BOT_TOKEN=token_compartido
TELEGRAM_CHAT_IDS=-1001234567890
```

Ambos reciben las mismas alertas (las del que esté corriendo el poller en ese momento) en el mismo grupo. Si los dos corren su propio server con su propio chart, ambos ven todo.

`TELEGRAM_CHAT_IDS` también acepta una lista comma-separated:

```env
TELEGRAM_CHAT_IDS=123456789,987654321,-1001234567890
```

---

## Troubleshooting

### El poller dice "tv CLI failed" o "ECONNREFUSED"

TradingView Desktop no está corriendo con CDP. Lanzalo con `--remote-debugging-port=9222` o usá el script del tradingview-mcp.

### Las alertas reportan un símbolo que no es el del chart que estoy mirando

Esto se arregló en el commit `18044d2`. El poller ahora refresca el símbolo en cada poll cycle. Cuando cambiás de chart en TradingView (ej. SOLUSDT → BTCUSD), el poller lo detecta en máximo 5s y re-indexa los OBs del nuevo chart como "ya vistos" para no spamearte con OBs viejos. Si tu repo es viejo, hacé `git pull`.

### Llegan alertas con `Price: NaN`

El mapeo de colores está vacío o mal configurado. Re-corré `node poller/index.js --inspect-colors` y `node poller/analyze.js`.

### No llega ninguna alerta nunca

- Confirmá con `node poller/analyze.js` que tu chart tiene OBs visibles.
- Verificá que el indicador se llama exactamente "Smart Money Concepts [LuxAlgo]" (el filtro del poller busca "LuxAlgo" en el nombre).
- Mandá un test manual: `curl -X POST http://localhost:3000/alert -H "Content-Type: text/plain" -d "OB_BULLISH_INTERNAL|100|0|TEST"`.

### Los colores cambian si cambio el tema o personalizo el indicador

Sí. Cualquier cambio visual al indicador → re-correr `--inspect-colors` y `analyze.js`.

---

## Estructura del repo

```
luxalgo-alerts/
├── server/             Express en :3000, recibe POST /alert y manda a Telegram
│   ├── index.js
│   ├── telegram.js     soporta uno o varios chat_ids
│   └── test-telegram.js
├── poller/             Node poller que lee TradingView vía tradingview-mcp CLI
│   ├── index.js        loop principal, soporta --dry-run y --inspect-colors
│   └── analyze.js      verifica color↔bias usando posición vs precio actual
├── start.bat           Windows: arranca ambos servicios en ventanas separadas
└── README.md
```

## Limitaciones conocidas

- El "color" de cada caja en el CDP no siempre coincide con lo que ves en pantalla — TradingView aplica blends. Por eso el mapeo de colores se valida con `analyze.js` (posición vs precio) en vez de hex matching.
- El indicador LuxAlgo dibuja **dos cajas adyacentes** por OB (con un punto medio compartido). El poller las agrupa por `(timestamp, color)` para emitir una sola alerta por OB.
- Si TradingView actualiza su estructura interna de Electron, los datos pueden cambiar de forma. tradingview-mcp depende de internals no documentados.
- LuxAlgo guarda hasta 100 OBs internamente pero solo dibuja los últimos N (5 por defecto). OBs viejos pueden desaparecer del chart sin haber sido invalidados.

## Licencia

MIT. Ver [LICENSE](LICENSE).
