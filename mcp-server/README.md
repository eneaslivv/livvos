# LIVV OS — MCP Server

Servidor **MCP (Model Context Protocol)** que expone las operaciones del dashboard de LIVV OS — tasks, projects, clients, leads, calendar, finance, brief, AI advisor — como **tools** para que Claude Code (o cualquier cliente MCP) pueda manejar el workspace directamente desde una conversación.

> **Pensado para uso del owner del workspace.** Usa la `service_role` key de Supabase y bypassea RLS. Todas las queries quedan hard-scoped al `LIVVOS_TENANT_ID` que definas — un typo en un argumento no puede tocar otro tenant.

---

## Tools disponibles (v0.1.0)

### Conexión
- **`whoami`** — Chequeo de conexión. Devuelve tenant id/name, plan, y conteos de tasks/projects/clients/leads. Corré esto primero.

### Tasks
- **`list_tasks`** — filtros: `status` (open/todo/in-progress/done/all), `assignee_id`, `project_id`, `due_before/after`, `search`, `limit`.
- **`create_task`** — `title` requerido + `project_id?`, `assignee_id?`, `due_date?`, `priority?`.
- **`update_task`** — `id` + cualquier campo. `status=done` auto-marca completed + stampea completed_at.
- **`complete_task`** — shortcut de update_task con status=done.

### Projects / Clients
- **`list_projects`** — filtros por status / client_id / search.
- **`create_project`** — `title` requerido + `client_id?`, `deadline?`, `budget?`.
- **`list_clients`** — todos los clientes.

### Leads (CRM)
- **`list_leads`** — filtro por status.
- **`update_lead`** — `id` + `status / owner_id / temperature / next_action / next_action_due` (los dos últimos se persisten en el JSONB `ai_analysis` así no requiere migración).

### Team
- **`list_team_members`** — miembros activos del workspace (id, name, email, role).

### Calendar
- **`list_calendar_events`** — rango `from/to`. Default = próximos 14 días.
- **`create_calendar_event`** — `title + start_date` requerido.

### Brief / Finance
- **`get_brief_today`** — overdue + due-today + events-today + pending messages. Mismo shape que la página Brief.
- **`get_finance_summary`** — totales de income / expense / balance por período (default = mes actual).

### AI
- **`ask_advisor`** — manda una pregunta al gemini edge function (`advisor_chat` o `advisor_chat_actions`). Requiere `SUPABASE_ANON_KEY` + `LIVVOS_USER_JWT` (ver más abajo).

---

## Setup en 5 pasos

### 1. Instalar dependencias

Desde la raíz del proyecto `eneas-os`:

```bash
cd mcp-server
npm install
```

### 2. Crear `.env` con tus credenciales

```bash
cp .env.example .env
```

Editá `.env` y llená:

| Variable | Dónde sacarla |
|----------|---------------|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Mismo lugar → `service_role` (⚠️ admin total — no compartas) |
| `LIVVOS_TENANT_ID` | Query: `select id, name from tenants;` y elegí el tuyo |
| `LIVVOS_OWNER_USER_ID` | (opcional) tu user_id — si no se setea, usa el primer member |
| `SUPABASE_ANON_KEY` | (opcional, solo para `ask_advisor`) — Project Settings → API → anon |
| `LIVVOS_USER_JWT` | (opcional, solo para `ask_advisor`) — logueate en la app, abrí DevTools → Application → Local Storage → buscá la key `sb-*-auth-token` y copiá el `access_token` |

### 3. Probar standalone

```bash
npm start
```

Deberías ver:
```
[livvos-mcp] connected via stdio. Waiting for client…
```

Es normal que quede esperando — está escuchando JSON-RPC por stdin. Matá con `Ctrl+C`.

### 4. Registrar el server con Claude Code

El server lee las credenciales del `.env` local (paso 2). Claude Code solo necesita saber dónde está el comando — sin secrets en la config del MCP.

Usá el CLI de Claude:

```bash
claude mcp add livvos -- npx tsx "C:/Users/eneas/Downloads/livv/eneas-os/mcp-server/src/index.ts"
```

(En Mac/Linux usá la ruta absoluta de tu repo.)

Verificá con:
```bash
claude mcp list
```

Debería aparecer `livvos: ... - ✓ Connected`.

### 5. Reiniciar Claude Code

Después de registrar el MCP, **cerrá y volvé a abrir Claude Code** (o corré `/mcp` desde adentro para ver el status).

Probá con:
```
@livvos whoami
```

Si responde con tu tenant id + counts, está funcionando 🎉

---

## Ejemplos de uso desde Claude Code

```
muéstrame mis tareas overdue
→ Claude usa list_tasks(status=open, due_before=<today>)

creá una tarea "review Sunnyside proposal" para el viernes asignada a Luis priority high
→ create_task con los campos resueltos

marcá completa la tarea X
→ complete_task

cómo viene el mes en finanzas
→ get_finance_summary

snapshot del día
→ get_brief_today

actualizá el lead de Ember Consulting a status=following y owner=Eneas, next_action "Build proposal v2"
→ update_lead

preguntale al advisor: ¿qué proyectos están en riesgo esta semana?
→ ask_advisor (requiere los env vars opcionales)
```

---

## Arquitectura

```
Claude Code (cliente MCP)
        ↓ stdio JSON-RPC
livvos-mcp (este server, Node)
        ↓ supabase-js + service_role key
Supabase (Postgres + edge functions)
```

Todas las queries pasan por `@supabase/supabase-js`. La service_role key bypassea RLS, así que tenés acceso completo. El scope al `tenant_id` lo aplicamos manualmente en cada query — está hard-coded para que un parámetro mal pasado no cruce tenants.

---

## Agregar un tool nuevo

1. Definí el schema de input con `zod` (al inicio del archivo)
2. Sumá una entrada al array `TOOLS` con `name + description + inputSchema: zodToJson(MiInput)`
3. Sumá un case al switch en el `CallToolRequestSchema` handler
4. Implementá la función `async function miTool(args)` siguiendo el patrón existente
5. Reiniciá Claude Code

El parser zod→JSON Schema al final del archivo cubre el subset que usamos (object/string/number/enum/uuid/regex/default/optional/nullable). Si necesitás algo más exótico (unions, arrays anidados, tuples) podés agregar al `zodToJson()` o pasar a `zod-to-json-schema` como dep.

---

## Seguridad

- **Nunca commitees** el `.env` ni el `.mcp.json` con secrets adentro. El `.gitignore` del proyecto ya excluye `.env`.
- La **service_role key** es admin total — quien la tenga puede leer y escribir cualquier tabla del proyecto Supabase. Tratala como una contraseña.
- El server **solo se ejecuta localmente** (stdio transport). No expone ningún puerto.
- Si querés multi-user en el futuro, hay que cambiar a auth con JWT del usuario (cada client MCP pasa su propio token) — pero pierde la simplicidad de single-user.

---

## Troubleshooting

| Síntoma | Fix |
|---------|-----|
| `[livvos-mcp] missing required env vars` | Faltan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, o `LIVVOS_TENANT_ID` en el env de Claude Code |
| Claude Code dice "MCP server failed to start" | Corré `npm start` manualmente desde `mcp-server/` para ver el error real |
| `whoami` devuelve `tenant_name: (unknown)` | El `LIVVOS_TENANT_ID` no existe en la tabla `tenants`. Verificá con `select id, name from tenants;` |
| `ask_advisor` falla con "requires SUPABASE_ANON_KEY + LIVVOS_USER_JWT" | Setealos en el env (ver paso 2). Sin ellos los demás tools funcionan, solo se desactiva ask_advisor. |
| JWT expirado | Los access_token de Supabase duran 1 hora por defecto. Refresheá pegando un nuevo token del localStorage. |
