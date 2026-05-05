# Prompt para David

Setup compartido — vamos a usar el **mismo bot de Telegram + un grupo de Telegram donde estamos los dos**, así ambos recibimos las alertas que cualquiera detecte en su chart.

Pegale esto a Claude Code (corriendo en su PC, en cualquier carpeta):

---

```
Hola Claude! Necesito que me ayudes a desplegar un proyecto que mi amigo Juan ya tiene
funcionando en su PC. El repo está en: https://github.com/juanchovg1/luxalgo-alerts

Contexto:
- El proyecto lee Order Blocks del indicador LuxAlgo Smart Money Concepts dibujados
  en TradingView Desktop (vía CDP en localhost:9222) y los envía como alertas a Telegram.
- Vamos a usar el bot que Juan ya creó (TradingBot_ByJuanV_bot) y un grupo de Telegram
  donde estamos los dos + el bot. Las alertas que yo detecte y las que Juan detecte
  en sus respectivos charts van al mismo grupo.
- Juan me va a pasar dos cosas por chat: (1) el TELEGRAM_BOT_TOKEN, (2) el TELEGRAM_CHAT_IDS
  con el chat_id del grupo (un número negativo).
- Yo ya tengo TradingView Desktop instalado con el indicador LuxAlgo SMC, y Node.js 18+.
- Yo ya tengo el proyecto tradingview-mcp instalado en mi PC (preguntame la ruta si
  la necesitás, debería estar en C:\Users\<mi_usuario>\tradingview-mcp).

Lo que necesito que hagas:

1. Cloná el repo en C:\luxalgo-alerts (o equivalente en mi sistema operativo).
2. Corré npm install dentro de server/ y dentro de poller/.
3. Pediime el TELEGRAM_BOT_TOKEN y el TELEGRAM_CHAT_IDS que Juan me debe haber pasado.
4. Confirmá que yo ya entré al grupo de Telegram (si no, recordame que tengo que aceptar
   la invitación que me mandó Juan).
5. Creá los archivos server/.env y poller/.env basándote en los .env.example que están
   en el repo. Llenalos con: token del bot, chat_id del grupo en TELEGRAM_CHAT_IDS,
   y la ruta a mi tradingview-mcp/src/cli/index.js.
6. Verificá que TradingView Desktop esté corriendo con --remote-debugging-port=9222
   ejecutando: node <ruta_a_tradingview-mcp>/src/cli/index.js status
   Si falla, guiame para lanzarlo en modo debug (en Windows el script
   scripts/launch_tv_debug.bat del repo tradingview-mcp lo hace solo).
7. Pediime que abra mi chart con el indicador LuxAlgo SMC y que tenga al menos un
   rectángulo verde Y uno rojo visibles (típicamente XAUUSD 1m o SOLUSDT 1m los
   genera rápido).
8. Corré: cd poller && node index.js --inspect-colors
   Después: node analyze.js
   Eso detecta los valores ARGB exactos de mi tema (pueden diferir de los de Juan).
   Actualizá poller/.env con los valores correctos de COLOR_BULLISH y COLOR_BEARISH.
   Regla: BULLISH es el color cuyos OBs están DEBAJO del precio actual (soporte);
   BEARISH es el color cuyos OBs están ENCIMA (resistencia).
9. Probá el pipeline con: cd server && npm run test:telegram
   Te debería llegar un mensaje al GRUPO de Telegram (no a mi chat privado, porque
   estamos usando TELEGRAM_CHAT_IDS apuntando al grupo). Confirmame que llegó.
10. Si no llega: chequea que yo esté en el grupo, que el bot esté en el grupo, y
    que el chat_id del grupo sea correcto (debe ser negativo, ej -1001234567890).
11. Una vez que el test llegó al grupo, arrancá los dos servicios:
    - Windows: ejecutá start.bat (abre dos ventanas)
    - Mac/Linux: arrancalos en dos terminales (server primero, poller después)
12. Confirmá viendo los logs del poller que dice "warmup: indexed N existing OBs"
    y avisame que a partir de ese momento cualquier OB nuevo en mi chart va al grupo.

Importante:
- NO hardcodees credenciales en el código, todo va en los .env.
- El .env nunca se commitea (está en el .gitignore del repo).
- Si algún paso falla, mostrame el error y proponeme una solución antes de improvisar.
- El README.md del repo tiene troubleshooting para problemas comunes.
```

---

## Lo que tenés que pasarle a David por chat (vos, Juan)

Después de tener el grupo creado y el chat_id:

```
Hola David! Te paso lo que necesitás para conectar tu PC al grupo de alertas:

TELEGRAM_BOT_TOKEN=<el token que tengo en mi server/.env>
TELEGRAM_CHAT_IDS=<el chat_id negativo del grupo>

Pegale el archivo PROMPT_FOR_DAVID.md (lo abrís en
https://github.com/juanchovg1/luxalgo-alerts/blob/main/PROMPT_FOR_DAVID.md)
a tu Claude Code y seguí los pasos. Cuando te pida el token y el chat_id, dáselos.
```
