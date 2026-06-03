# PLAYBOOK.md — aurora-livv

> Living document of how the multi-agent layer was built on top of Livv.
> Mirrors the original Aurora playbook (Payper) for traceability — same 14 criteria, applied to Livv's domain.

---

## Parte 1 · Resumen de lo entregado para Livv

### Sistema en 1 párrafo

Asistente operativo con 3 personalidades especializadas (Solara ventas · Marina finance · Nova growth) más un orchestrator (Atlas) que aparece como FAB persistente en el admin de Livv. Al abrirlo se desliza un dock derecho con chat + previews multi-step que el usuario puede confirmar o editar. Cada agente tiene 12 dimensiones de personalidad editables desde DB, skills propias con SQL real contra el schema existente de Livv (`leads`, `clients`, `finances`, `projects`, `web_analytics`), tools agrupados por tier de riesgo (READ/WRITE/DESTRUCTIVE), audit log inmutable, kill switch, idempotency y compensación Saga. Modo dual: las 3 personalidades visibles (`multi`) o todas como Livv Assistant unificado (`unified`), intercambiable vía `tenant_config.agent_mode` sin reload. Backend en Supabase con schema `agents.*` separado. 54 evals automatizados con seed SQL determinista.

### Lo entregado en números

| Categoría | Cantidad | Ubicación |
|---|---|---|
| Agentes con prompt completo | 4 (Atlas + Solara + Marina + Nova) | `agents/*.md` |
| Skills compartidas | 9 | `skills/` |
| Skills específicas por agente | 15 (5 × 3) | `skills-solara/`, `skills-marina/`, `skills-nova/` |
| Tablas SQL nuevas | 11 (schema `agents.*`) + 4 cols a `tenant_config` | `db/migrations/01_agents_schema.sql` |
| Vistas SQL operativas | 8 | `db/views/02_agent_metrics.sql` |
| Casos de eval ejecutables | 54 (18 × 3) | `evals/cases-*.json` |
| Frontend Next.js implementado | 4 páginas + AuroraDock funcional + mock backend | `frontend-next/` |
| Documentos referenciales | 7 .md raíz | DISCOVERY, README, IMPLEMENTATION, SCHEMA_GAPS, EXPANSION_PLAN, TESTING, PLAYBOOK |

### Stack final (Livv version)

| Layer | Choice | Source |
|---|---|---|
| Frontend host | React 19 + Vite 5 (Livv existing) | sobreescribimos solo el FAB |
| Frontend del dock (este folder) | Next.js 14 + TS + design tokens via CSS vars | independent shell que se podrá portar como package |
| Backend chat | Next API route + Anthropic SDK | mock por defecto, live con env var |
| DB | Supabase existente de Livv + nuevo schema `agents.*` separado | sin tocar `public.*` |
| LLM | Claude Sonnet 4.6 para especialistas, Opus 4.6 para Atlas | costo balanceado |

---

## Parte 2 · Los 14 criterios aplicados a Livv

### 1. Discovery primero, prompts después
Leí el schema canónico de Livv (`supabase_schema.sql` + ~35 migrations), `cloud-code/SYSTEM.md`, `cloud-code/AGENTS.md` y los 12 agent docs existentes (que son agentes de desarrollo, no de chat). Identifiqué 8 schema gaps documentados en SCHEMA_GAPS.md ANTES de escribir un solo prompt.

### 2. Auditor de coherencia
Cada SQL dentro de las skills está cross-referenciado contra columnas reales. Cuando una columna asumida no existe (`finances.currency`, `proposals.payment_terms_days`), Marina lo dice explícitamente y no lo inventa. La sección "Known gaps" en `skills/project-schema.md` lista todo lo que **no** hay que pretender que existe.

### 3. Multi-agente, no mono-agente
Livv tiene 15 dominios funcionales. Un único prompt sería 50k tokens y se contradeciría a sí mismo entre dominios. Tres especialistas focalizados + un router rinden mejor por costo, latencia y testeabilidad. Atlas pesa 1.5k tokens y solo decide a quién pasar; Solara/Marina/Nova cargan ~3k cada uno con sus 5 skills on-demand.

### 4. Personalidades nombradas con identidad visual
- **Solara** · magenta `#E11D74` · "Closes deals like fine art" · BDR coach voice (warm 8, humor 4)
- **Marina** · emerald `#10B981` · "Calm waters in the cashflow" · controller voice (humor 1, formality 7)
- **Nova** · electric blue `#3B82F6` · "The signal in the noise" · analyst voice (cooler, asks for window)
- **Atlas** · slate `#475569` · "The map that routes the work" · chief-of-staff, never answers

### 5. Modo dual (multi vs unified)
`tenant_config.agent_mode` columna agregada por la migración. Backend siempre devuelve `agent`; front decide multi vs unified. El toggle del topbar usa localStorage para demo; en prod escribe esa columna.

### 6. 12 dimensiones formalizadas
Cada `agents/{name}.md` arranca con frontmatter YAML de 12 campos: identidad (5), voz (5), comportamiento (4 listas). Editable sin redeploy si se carga desde DB; testeable con asserts en el eval runner.

### 7. Skills atómicas con SQL real
15 skills específicas, cada una con: cuándo usarla, SQL exacto contra el schema real de Livv, lógica de cálculo, formato de output, prohibiciones. Cargables on-demand — el prompt principal queda chico, las skills cargan cuando hace falta.

### 8. Tier de riesgo READ / WRITE / DESTRUCTIVE
Cada tool clasificado en `tools_by_tier`. UI respeta el tier automáticamente (mostrado en `skills/tool-confirmation.md`). DESTRUCTIVE requiere typing-confirmation "BORRAR" + cooldown 5s + notificación al owner.

### 9. Audit log + idempotency + kill switch desde día uno
Las 11 tablas de `agents.*` cubren los 3 (`audit_log`, `idempotency_keys`, `kill_switches`). Sin estas tres tablas, conectar el LLM a la DB sería ruleta rusa.

### 10. Saga para multi-step
`agents.compensations` registra cada paso de un workflow multi-step. Si Marina invoca `draft_invoice_from_proposal` y el paso 3 falla, los pasos 1-2 se deshacen en orden inverso. Cada agente declara su `compensation_map` en frontmatter.

### 11. Output visual estructurado (canvas v2.0)
4 tipos: `display` · `workflow` · `interactive` · `route`. 8 block kinds (`stat_cards`, `lead_list`, `project_grid`, `bar_chart`, `donut_chart`, `attribution_table`, `markdown_block`). Documentados en `skills/visual-output.md`. Branding cambia por `canvas.agent` sin código distinto.

### 12. Evals como ciencia
54 cases en 3 JSON ejecutables. Assertions concretas: `must_mention`, `must_not_mention`, `must_emit_canvas`, `canvas_required_blocks`, `must_not_invent_numbers`, `max_length_chars`, `must_state_window`, `must_state_n`, `must_format_money_two_decimals`. Cada case tiene seed determinista. Runner Python genera HTML report.

### 13. Mock antes de live
`evals/mock_backend_py.py` y `frontend-next/lib/mock-backend.ts` son espejos exactos del mismo set de keyword rules. Front funciona end-to-end sin LLM ni Supabase. Costo de iteración: 0.

### 14. Reuse del diseño existente
La paleta y los tokens de Livv (whitelabel JSONB en `tenant_config.branding`) se respetan — el frontend del dock declara variables CSS que cualquier wrapper de Livv puede sobreescribir. Componentes neutros por defecto.

---

## Parte 3 · Cómo se "entrenaron" los bots de Livv

No hay fine-tuning. Cada agente se construyó así:

**Fase 1 — Discovery** (½ día porque mucho ya estaba en `cloud-code/`)
- Leí `cloud-code/SYSTEM.md`, `cloud-code/AGENTS.md`, `cloud-code/agents/*.md`
- Mapeé los 15 dominios del mensaje del usuario → 3 agentes prioritarios
- Identifiqué los 8 schema gaps relevantes

**Fase 2 — Identidad por agente** (1h × 3)
- Nombre, color, glyph, tagline
- 12 dimensiones llenadas para cada uno
- Routing rules para Atlas

**Fase 3 — Prompt principal** (3h × 3)
- Backstory + dominio + tablas que toca
- Reglas duras del negocio (state machine de leads, business model enum, AR aging buckets, etc.)
- Lista de tools por tier
- Formato de respuesta y prohibiciones

**Fase 4 — Skills atómicas** (~1h × 15)
- 5 por agente
- SQL exacto contra el schema real
- Lógica determinista y prohibiciones específicas

**Fase 5 — Auditor** (1h)
- Cruzar cada SQL contra columnas/enums reales
- Documentar gaps en SCHEMA_GAPS.md
- 8 hallazgos, ninguno bloqueante para v1 mock

**Fase 6 — Seed + Evals** (1 día)
- `seed-data.sql` con 1 tenant, 7 leads en stages variados, 5 projects, finances con estados diversos, web_analytics
- 18 cases por agente con assertions ejecutables
- Runner Python con HTML report

**Fase 7 — Frontend mock** (1 día)
- Next.js 14 + TS shell
- AuroraDock + AuroraFab + Canvas
- Mock backend con 60+ keyword rules
- 4 páginas de demo

**Fase 8 — Connect live** (½ día — esqueleto, no ejecutado)
- API route con switch mock/live
- Skeleton para cargar prompt desde `agents/{slug}.md` e invocar Anthropic

**Fase 9 — Tools agénticos** (no shipped en v1)
- Cada tool del catalog necesita un endpoint
- Audit log + idempotency + kill switch ya tienen las tablas

**Fase 10 — Iteración con métricas runtime** (no shipped en v1)
- Las 8 vistas SQL están listas

**Total**: ~10 días para llegar a mock funcional + esqueleto live. ~15 días más para production-ready end-to-end.

---

## Parte 4 · Playbook para el próximo agente de Livv

Cuando quieras agregar un 5to (Sol / Vera / Tara según `EXPANSION_PLAN.md`), seguí esto:

1. Crear `agents/{slug}.md` con frontmatter de 12 dimensiones. Copiar uno existente como base.
2. Crear `skills-{slug}/` con 3–6 skills atómicas. SQL real contra tablas existentes o documentar tablas nuevas en SCHEMA_GAPS.
3. Agregar al routing table de Atlas (en `agents/atlas.md`).
4. Agregar 15+ cases a `evals/cases-{slug}.json`.
5. Agregar las reglas keyword al mock backend (tanto Python como TS).
6. Si necesita tablas nuevas, escribir migration y agregar a la lista en `IMPLEMENTATION.md`.
7. Correr evals nivel 3 → ajustar prompts hasta ≥95% pass rate en mock.
8. Si vas a live, correr evals nivel 4 con LLM real.

---

## Parte 5 · Mega-prompt copy-paste para próximo proyecto

Si querés clonar este sistema a otro producto (Buyscalo, por ejemplo), abrí un agente nuevo y pegá esto:

> **Hola. Quiero que armes un sistema multi-agente para mi proyecto `{NOMBRE_PROYECTO}`, siguiendo exactamente el enfoque que se aplicó a Livv en `aurora-livv/PLAYBOOK.md`. Te paso el contexto:**
>
> **1. Producto**: `{NOMBRE_PROYECTO}` es un `{TIPO_DE_PRODUCTO}`. Sus usuarios son `{ROLES}`. Lo crítico que hacen es `{TAREAS_PRINCIPALES}`.
>
> **2. Stack**: backend `{ej. Supabase con RLS por org_id}` · frontend `{ej. Next.js + TS}` · auth `{ej. Supabase}` · otros `{ej. Stripe}`.
>
> **3. Docs que te paso**: `{schema.sql}` · `{glossary.md}` · `{modules.md}` · `{design-tokens.json o Figma link}`.
>
> **4. Dominios funcionales**: `{N}` dominios — `{LISTAR}`. Para v1 cubrí los 3 prioritarios: `{TOP_3}`.
>
> **5. Modo**: `{multi | unified | dual}`. Si multi, dame 3 personalidades con nombre + color + tagline.
>
> **6. Fases (idénticas al playbook de Livv)**:
>
> **A — Discovery**: leé toda la doc → mapeá dominios a agentes → auditá schema → proponé identidades.
>
> **B — Sistema multi-agente**: generá `agents/orchestrator.md` + 3 `agents/{nombre}.md` con 12 dimensiones, `skills/` (9 compartidas), `skills-{nombre}/` (5 × 3 atómicas con SQL real), `db/migrations/01_agents_schema.sql` (11 tablas en `agents.*`), `db/views/02_agent_metrics.sql` (8 vistas), seed + 15+ casos por agente + runner Python + mock backend, y los 7 docs (README, IMPLEMENTATION, SCHEMA_GAPS, EXPANSION_PLAN, TESTING, DISCOVERY, PLAYBOOK).
>
> **C — Frontend Next.js**: shell con sidebar/topbar/4+ pages, AuroraDock funcional, switcher multi/unified, mock backend mirror, /api/chat con skeleton live.
>
> **D — Playbook consolidado**: este mismo doc adaptado al nuevo producto.
>
> **Reglas de oro (no negociables)**:
> 1. Discovery primero, prompts después.
> 2. Auditor antes de cerrar fase B.
> 3. Tier READ/WRITE/DESTRUCTIVE en todos los tools.
> 4. Audit log + idempotency + kill switch desde día uno.
> 5. Mock antes de live.
> 6. Reuse del diseño si existe.
> 7. 12 dimensiones formalizadas por agente.
> 8. Skills atómicas con SQL real.
> 9. Evals con assertions ejecutables.
> 10. Canvas con 3 modos, no markdown libre.
>
> **Empezá por Fase A. Si algo del schema no te queda claro antes de avanzar, parame y preguntame.**

---

## TL;DR para Livv

Tres agentes (Solara, Marina, Nova) + un orchestrator (Atlas). Schema-aware. Tier-of-risk en todos los writes. Audit + idempotency + saga compensation desde día uno. 54 evals. Mock funcional. Esqueleto live wireado. Documentado en 7 archivos .md.

Próximo paso: aplicar las migrations en staging de Livv, correr el seed, y empezar a iterar evals en modo mock antes de gastar tokens.
