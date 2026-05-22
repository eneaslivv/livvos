# Slack agentic mode — test recipes

Setup manual de Slack app + recipes de smoke tests para verificar el flow
end-to-end después del deploy.

## Setup en Slack app dashboard

Acceder a https://api.slack.com/apps → seleccionar la app instalada en
"CK Studio" workspace.

### 1. Event Subscriptions
**Request URL**: `https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/slack-events`

**Subscribe to bot events**:
- `message.channels` — mensajes en canales públicos donde el bot está
- `message.groups` — mensajes en canales privados donde el bot está
- `message.im` — DMs al bot (recomendado)
- `app_mention` — @LivvBot menciones (CRÍTICO para PR3 funcione)
- `reaction_added` — ✅ que completa tasks vinculadas (PR1)

### 2. Slash Commands
**Add new** → `/livv`
**Request URL**: `https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/slack-actions`
**Short description**: `LivvOS commands — task / done / brief / link / help`

### 3. Interactivity & Shortcuts
**Toggle ON** → **Request URL**: `https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/slack-actions`
(mismo URL que el slash command — un solo endpoint maneja ambos)

### 4. Reinstall app
Si algún scope cambió, reinstalar la app al workspace para que los nuevos
permissions hagan effect.

---

## Smoke tests (en orden recomendado)

### Test 1 — slack-events recibe y procesa
1. En el workspace de prueba, postear un mensaje en un canal monitoreado:
   > "Hola, podés mandarme el invoice de marzo? Para el viernes idealmente."
2. Esperar ~5s, revisar `communication_messages`:
   ```sql
   SELECT id, ai_processed, ai_classification->>'intent' AS intent,
          ai_classification->>'confidence' AS conf,
          ai_classification->>'should_create_task' AS task
   FROM communication_messages
   WHERE platform='slack'
   ORDER BY received_at DESC LIMIT 1;
   ```
3. Esperado: `ai_processed=true`, `intent='new_request'`, `conf>=0.50`,
   `task='true'`.

### Test 2 — comm-classify crea notification
Después del Test 1, si el classifier sugirió task con confidence ≥0.50:
```sql
SELECT title, priority, metadata->>'confidence' AS conf
FROM notifications
WHERE category='communications' AND type='mention'
ORDER BY created_at DESC LIMIT 1;
```
Esperado: notif con título `📥 <from> en #<canal>: "..."` y priority del intent.

### Test 3 — Slash command /livv help
En cualquier canal del workspace:
```
/livv help
```
Esperado: respuesta ephemeral con lista de comandos.

### Test 4 — Slash command /livv task
```
/livv task Diseñar landing de Acme | due 2026-05-28 | assign @maria
```
Esperado:
- Ephemeral: `✅ Created task *Diseñar landing de Acme* · due 2026-05-28 · assigned`
- Task aparece en LivvOS.
- Si maria tiene `slack_user_id` linkeado, recibe DM con block kit.

### Test 5 — /livv link (linkear cuenta)
En DM al bot o en cualquier canal:
```
/livv link tu-email@livv.studio
```
Esperado: `✅ Linked!`. A partir de ahora todas las task assignments te llegan
como DM en Slack.

### Test 6 — slack-agent responde a @mention
En un canal monitoreado:
```
@LivvBot resumime qué pasó en este canal en los últimos días
```
Esperado: bot responde en el thread original con un resumen del proyecto
vinculado al canal + últimas tasks.

### Test 7 — Reaction ✅ completa task
1. Encontrar un mensaje en `#<canal>` que generó una task (campo `task_id` set).
2. Reaccionar con `:white_check_mark:` al mensaje.
3. Verificar que la task se marcó como completed:
   ```sql
   SELECT id, title, completed, status FROM tasks WHERE id = '<task_id>';
   ```

### Test 8 — Reverse flow OS→Slack DM
1. En LivvOS, asignar una task a un user que tenga `slack_user_id` linkeado
   (via `/livv link`).
2. Verificar que el user recibe DM con block kit:
   - Header "Te asignaron una tarea" + título
   - Buttons: ✅ Aceptar | 😴 Snooze 24h | 🔗 Ver en LivvOS
3. Click ✅ Aceptar:
   - El mensaje en Slack se replace con `✅ Aceptaste la tarea. Status → In Progress.`
   - En LivvOS: `tasks.status = 'In Progress'`.

### Test 9 — Rate limit
Disparar >120 mensajes en 60s desde un canal monitoreado.
- En logs de slack-events: `[slack-events] rate limited tenant <id> — N events in last 60s`.
- A partir del msg 121: skip (no se insertan en `communication_messages`).
- Cuando baja el rate, vuelve a procesar normalmente.

### Test 10 — Circuit breaker
- Forzar 3 fallas consecutivas de OpenAI (e.g. desactivando temporalmente el
  API key).
- Esperado: comm-classify entra en circuit-breaker mode, agrega
  `ai_classification: {error: 'circuit_breaker_active'}` a los próximos
  mensajes y crea **una** notificación al owner del tenant
  (`🚨 Slack agent — circuit breaker active`).
- Re-activar el API key → próximas clasificaciones funcionan normal.

---

## Diagnóstico rápido (cuando algo falla)

### Ver últimos event logs
```sql
SELECT event_type, processing_status, error_message, channel_id, created_at
FROM slack_event_log
ORDER BY created_at DESC LIMIT 30;
```

### Ver últimos mensajes sin clasificar
```sql
SELECT id, channel_name, body_text, ai_classification
FROM communication_messages
WHERE platform='slack' AND ai_processed = false
ORDER BY received_at DESC LIMIT 10;
```

### Ver responses de pg_net (clasificación async)
```sql
SELECT id, status_code, substring(content::text, 1, 300) AS response
FROM net._http_response
ORDER BY id DESC LIMIT 20;
```

### Re-clasificar manualmente un mensaje
```sql
SELECT net.http_post(
  url := 'https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/comm-classify',
  body := jsonb_build_object('message_id', '<UUID>'),
  headers := jsonb_build_object('Content-Type', 'application/json'),
  timeout_milliseconds := 45000
);
```

### Resetear circuit breaker (limpiar errors recientes)
```sql
UPDATE communication_messages
SET ai_classification = ai_classification - 'error'
WHERE tenant_id = '<TENANT_UUID>'
  AND ai_classification ? 'error'
  AND received_at > now() - interval '30 minutes';
```
