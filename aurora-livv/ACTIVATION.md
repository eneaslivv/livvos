# ACTIVATION — encendido de aurora en Livv

> Cómo prender el sistema multi-agente en eneas-os. **Funciona en mock por defecto.** Seguí los 3 pasos para encenderlo con Claude real.

---

## Pre-flight: ¿qué quedó instalado en tu codebase?

Estos archivos nuevos viven dentro de `eneas-os/`:

```
types/aurora.ts
lib/aurora/tokens.ts
lib/aurora/agents.ts
lib/aurora/mockBackend.ts
context/AuroraContext.tsx
hooks/useAurora.ts
components/aurora/AuroraFab.tsx
components/aurora/AuroraDock.tsx
components/aurora/AuroraCanvas.tsx
supabase/functions/aurora-chat/index.ts
supabase/functions/aurora-chat/prompts.ts
App.tsx                              ← editado: AuroraProvider + AuroraFab
aurora-livv/                         ← carpeta de diseño + docs + evals (no se ejecuta)
```

---

## Estado por defecto: mock

Sin tocar nada más, **el FAB ya funciona**. Arranca tu dev server:

```bash
npm run dev
```

Vas a ver una pelota de color (magenta = Solara) abajo a la derecha. Click → se abre el dock, podés cambiar entre Solara / Marina / Nova, escribir, recibir respuestas canned con canvas estructurado. **No gasta tokens.**

Esto es porque `VITE_AURORA_LIVE` no está seteado y el context defaultea a mock.

---

## Paso 1 — aplicar la migration al schema `agents.*` en tu Supabase

Esto crea las 11 tablas (sessions, messages, tool_calls, audit_log, idempotency_keys, kill_switches, compensations, artifacts, evals_runs, feedback, memories) + agrega 4 columnas a `tenant_config` (`agent_mode`, `default_currency_code`, `stage_probabilities`, `north_star_metric`).

**Opción A — con el CLI de Supabase (recomendado):**

```bash
# Desde la raíz del proyecto eneas-os
supabase db push --include-all
```

**Opción B — a mano si querés revisar primero:**

1. Abrir el SQL Editor en tu dashboard de Supabase.
2. Copiar el contenido de `aurora-livv/db/migrations/01_agents_schema.sql` y ejecutarlo.
3. Copiar el contenido de `aurora-livv/db/views/02_agent_metrics.sql` y ejecutarlo.

> Es idempotente: si la corrés dos veces no rompe nada.

**Verificación:**

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'agents';
-- Deberías ver: sessions, messages, tool_calls, audit_log, idempotency_keys,
-- kill_switches, compensations, artifacts, evals_runs, feedback, memories
```

---

## Paso 2 — cargar la API key de Anthropic como secret en Supabase

Necesitás una API key de [console.anthropic.com](https://console.anthropic.com). Empieza con `sk-ant-`.

```bash
# Reemplazá sk-ant-XXXXXX con tu key real
supabase secrets set ANTHROPIC_API_KEY=sk-ant-XXXXXX
```

**Opción dashboard:** Project Settings → Edge Functions → Add secret → name `ANTHROPIC_API_KEY`, value `sk-ant-...`.

---

## Paso 3 — deployar la Edge Function `aurora-chat`

```bash
supabase functions deploy aurora-chat --no-verify-jwt
```

> `--no-verify-jwt` permite que llame el usuario logueado sin pasos extra; la función igual valida el tenant via JWT cuando se lo pasamos. Si querés JWT estricto: sacá el flag y agregá `await supabase.functions.invoke('aurora-chat', { headers: { Authorization: ... }})` en `AuroraContext.tsx`.

**Verificación:**

```bash
# Reemplazá <project-ref> con tu ref (sale en el dashboard URL)
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/aurora-chat" \
  -H "apikey: <YOUR_SUPABASE_ANON_KEY>" \
  -H "content-type: application/json" \
  -d '{"agent":"solara","message":"hola"}'
```

Deberías ver JSON con `{"agent":"solara","text":"...","canvas":...}`.

---

## Paso 4 (final) — flippear el cliente a live

Agregá esto a tu `.env.local`:

```
VITE_AURORA_LIVE=true
```

Reiniciá el dev server:

```bash
npm run dev
```

El FAB ahora va a llamar a la Edge Function en cada mensaje. **El mock queda como fallback automático** — si la Edge Function tira error, el cliente cae al mock para que la UX no se rompa nunca.

---

## Switch multi ↔ unified por tenant

Cada tenant elige si ve las 3 personalidades o una sola voz unificada:

```sql
-- Multi: 3 personalidades visibles (default)
UPDATE tenant_config SET agent_mode = 'multi' WHERE tenant_id = '<your-tenant-uuid>';

-- Unified: una sola cara "Livv Assistant"
UPDATE tenant_config SET agent_mode = 'unified' WHERE tenant_id = '<your-tenant-uuid>';
```

> v1: el cliente lee este flag desde localStorage. Para v2, cablear `tenant_config.agent_mode` desde el `TenantContext`.

---

## Kill switch (apagar el sistema sin redeploy)

Si necesitás cortar el sistema de golpe (incidente, costo runaway, etc.):

```sql
-- Apagar todo el sistema para un tenant
INSERT INTO agents.kill_switches (scope, scope_value, active, reason, activated_by)
VALUES ('tenant', '<your-tenant-uuid>', true, 'incident', auth.uid());

-- Apagar solo Solara
INSERT INTO agents.kill_switches (scope, scope_value, active, reason, activated_by)
VALUES ('agent', 'solara', true, 'test', auth.uid());

-- Apagar global
INSERT INTO agents.kill_switches (scope, scope_value, active, reason, activated_by)
VALUES ('global', null, true, 'maintenance', auth.uid());

-- Reactivar
UPDATE agents.kill_switches SET active = false, deactivated_at = now() WHERE active = true;
```

> v1: la edge function NO consulta `kill_switches` todavía (es scope v2). Mientras tanto, sacando `VITE_AURORA_LIVE` del .env o eliminando la edge function se logra el mismo efecto.

---

## Costos esperados (mes 1, en USD)

| Item | Estimado |
|---|---|
| Tokens Anthropic (5 usuarios activos, ~50 mensajes/día, 80% Sonnet / 20% Opus) | $30–60 |
| Supabase Pro (si todavía estás en free) | $25 |
| Edge Function calls (~7,500/mes, gratis hasta 500K) | $0 |
| **Total mes 1** | **~$55–85** |

---

## Troubleshooting

**El FAB no aparece en pantalla**
- Verificá que `App.tsx` tiene `<AuroraProvider>` envolviendo `<AppContent>` y que `<AuroraFab />` está dentro del provider.
- Verificá que estás autenticado (el FAB solo aparece en el admin, no en `/accept-invite` ni public portals).

**Respuestas vacías o "Tuvo un error el modelo"**
- Verificá `supabase functions logs aurora-chat` — la causa más común es `ANTHROPIC_API_KEY` mal seteada.
- Verificá que tu key tiene crédito en console.anthropic.com.

**"aurora-chat empty response" en la consola del browser**
- La función no está deployada o devolvió 500. El sistema cae a mock automáticamente, pero corregilo: `supabase functions deploy aurora-chat`.

**"Cannot read property 'currentTenant' of null"**
- Significa que `AuroraProvider` quedó fuera de `TenantProvider`. Verificá el orden en `App.tsx`.

**El mock no me da resultados que necesito para una demo**
- Editá `lib/aurora/mockBackend.ts` y agregá tus keywords. Es deliberadamente extensible.

---

## Próximos pasos (v2)

1. Conectar los **tools de tier WRITE** a endpoints reales (`update_lead_status`, `draft_invoice_from_proposal`, etc.). Hoy son canvas de preview, falta el commit handler.
2. **Audit log integration**: la Edge Function ya tiene los hooks de `agents.messages` — agregar `agents.audit_log` cuando se introduzcan los tools.
3. **Kill switch check** dentro de la Edge Function antes de llamar a Claude.
4. **5to agente** (Sol/Daily Coach): según `aurora-livv/EXPANSION_PLAN.md`.

---

Listo. Si llegaste hasta acá y los 3 comandos corrieron OK, **el dock ya está hablando con Claude real** sobre el schema real de Livv. ¿Algo se rompe? Pegame el output del console + `supabase functions logs aurora-chat` y lo destrabamos.
