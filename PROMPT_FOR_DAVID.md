# Prompt para David

Pegale esto a Claude Code (corriendo en su PC, en cualquier carpeta).

---

```
Hola Claude! Necesito que me ayudes a desplegar un proyecto que mi amigo Juan ya tiene
funcionando en su PC. El repo está en: https://github.com/REEMPLAZAR_USUARIO/luxalgo-alerts

Contexto:
- El proyecto lee Order Blocks del indicador LuxAlgo Smart Money Concepts dibujados
  en TradingView Desktop (vía CDP en localhost:9222) y los envía como alertas a Telegram.
- Yo ya tengo TradingView Desktop instalado con el indicador LuxAlgo SMC.
- Yo ya tengo el proyecto tradingview-mcp instalado en mi PC (preguntame la ruta si
  la necesitás, debería estar en C:\Users\<mi_usuario>\tradingview-mcp).
- Tengo Node.js 18+ instalado.

Lo que necesito que hagas:

1. Cloná el repo en C:\luxalgo-alerts (o equivalente en mi sistema operativo).
2. Corré `npm install` dentro de server/ y dentro de poller/.
3. Guiame paso a paso para crear mi propio bot de Telegram con @BotFather y
   obtener mi chat ID con @userinfobot. Pediime los valores cuando los tenga.
4. Creá los archivos server/.env y poller/.env basándote en los .env.example que
   están en el repo. Llenalos con: mi token de bot, mi chat ID, y la ruta a mi
   tradingview-mcp/src/cli/index.js.
5. Verificá que TradingView Desktop esté corriendo con --remote-debugging-port=9222
   ejecutando `node <ruta_a_tradingview-mcp>/src/cli/index.js status`. Si falla,
   guiame para lanzarlo en modo debug.
6. Pediime que abra mi chart con el indicador LuxAlgo SMC y que tenga al menos un
   rectángulo verde Y uno rojo visibles (típicamente XAUUSD 1m o SOLUSDT 1m los
   genera rápido).
7. Corré `node poller/index.js --inspect-colors` y después `node poller/analyze.js`
   para detectar los valores ARGB exactos de mi tema. Actualizá poller/.env con
   los valores correctos de COLOR_BULLISH y COLOR_BEARISH (BULLISH es el que tiene
   los OBs DEBAJO del precio actual, BEARISH es el que los tiene ENCIMA).
8. Probá el pipeline con `cd server && npm run test:telegram`. Confirmame que
   me llegó el mensaje a Telegram. Si no llega, recordá que tengo que mandarle
   /start a mi bot primero.
9. Una vez que llega el test, arrancá los dos servicios:
   - Si estoy en Windows: ejecutá start.bat (abre dos ventanas)
   - Si estoy en Mac/Linux: arrancalos en dos terminales (server primero, poller después)
10. Confirmá viendo los logs del poller que dice "warmup: indexed N existing OBs".
    Avisame que a partir de ese momento cualquier OB nuevo en mi chart me llega a Telegram.

Importante:
- NO hardcodees credenciales en el código, todo va en los .env.
- Si algún paso falla, mostrame el error y proponeme una solución antes de improvisar.
- El README.md del repo tiene troubleshooting para los problemas comunes.
```

---

## Si quieren compartir el bot/chat (opcional)

Si después David y yo queremos que ambos recibamos las alertas en un mismo grupo
de Telegram, en lugar de chats individuales:

1. Crean un grupo en Telegram con ambos.
2. Agregan el bot al grupo (cualquiera de los dos bots sirve).
3. Mandan un mensaje en el grupo.
4. Visitan `https://api.telegram.org/bot<TOKEN>/getUpdates` en el navegador.
5. Buscan el `chat.id` (es negativo, tipo `-1001234567890`).
6. En `server/.env` de cada uno reemplazan `TELEGRAM_CHAT_ID` por:
   ```env
   TELEGRAM_CHAT_IDS=-1001234567890
   ```
7. Reinician el server. Ahora ambos reciben las alertas que cada uno detecte
   en su propio chart.
