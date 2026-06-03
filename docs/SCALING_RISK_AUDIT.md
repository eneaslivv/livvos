# Auditoria de escalabilidad y riesgos

## Resumen ejecutivo

eneas-os ya tiene una base amplia para un SaaS multi-tenant: autenticacion, tenants, RBAC, proyectos, CRM, finanzas, calendario, documentos, notificaciones, agentes y modulos internos. El riesgo principal no es falta de funcionalidades, sino consistencia entre capas: frontend, RLS, migraciones, triggers y datos multi-tenant no siempre estan alineados.

Prioridad inmediata:

1. Cerrar rutas de seguridad client-side: no usar mocks, aliases admin ni permisos solo en UI.
2. Endurecer Supabase: RLS tenant-scoped, indices por `tenant_id`, backfills y constraints.
3. Sacar secretos del cliente: credenciales, payment processors y operaciones admin deben ir a Edge Functions.
4. Reducir deuda de frontend: paginas grandes, icon registry fragil, context providers muy acoplados.
5. Implementar jobs backend para tareas que hoy dependen del cliente: recordatorios, analytics, AI analysis, invitaciones.

## Arquitectura actual

El producto funciona como una SPA React/Vite con Supabase como backend principal. La app carga un stack de providers globales: RBAC, tenant, notificaciones, team, clients, calendar, documents y projects. Esto simplifica consumo de datos, pero crea dos problemas al escalar:

- Cada modulo tiende a traer estado global aunque el usuario no lo necesite.
- Los providers pueden ocultar errores de permisos o datos incompletos hasta runtime.

La base de datos esta orientada a multi-tenancy con `tenant_id`, pero hay tablas historicas y migraciones donde aparecen excepciones tipo `tenant_id IS NULL` o politicas amplias. Eso es util para transicion, pero peligroso para produccion.

## Riesgos criticos

### Seguridad

- Los permisos de UI no alcanzan: todo acceso debe estar respaldado por RLS y funciones SQL.
- Cualquier fallback mock en auth/RBAC puede abrir datos o acciones en escenarios no autenticados.
- `supabaseAdmin` no debe existir en runtime browser. Las operaciones admin deben moverse a Supabase Edge Functions.
- Credenciales de proyectos, clientes y procesadores de pago requieren cifrado autenticado y rotacion de claves.

### Multi-tenant

- Las politicas que permiten `tenant_id IS NULL` son riesgo de fuga entre tenants.
- Faltan constraints consistentes para garantizar que cada registro de negocio pertenezca a un tenant.
- Backfills automaticos que asignan el primer tenant disponible pueden contaminar datos historicos.

### Base de datos

- Sin indices compuestos por `tenant_id`, listas grandes como proyectos, tareas, clientes, leads, calendario y activity logs se degradan rapido.
- Hay duplicidad conceptual entre `activities` y `activity_logs`.
- Finanzas combina datos calculados y editables; eso puede romper auditoria y reporting.

### UX y frontend

- El error `Element type is invalid` en `platform_sales_agent` vino de un icono no registrado. Este patron puede repetirse si el registro de iconos no se valida.
- Chunks grandes: el bundle principal supera el umbral de Vite. Esto impacta carga inicial.
- Hay pantallas muy densas con cards/listas que necesitan estados vacios, loading y error mas consistentes para uso real.

### Operacion

- Invitaciones, recordatorios, analytics y AI analysis necesitan jobs backend. Si dependen del cliente, fallan cuando nadie tiene la app abierta.
- Falta observabilidad productiva: errores de RLS, latencia de queries y fallos de Edge Functions deberian quedar centralizados.

## Cambios aplicados en esta pasada

- Auth/profile: `ensureProfile()` ahora alinea `profiles.id` con `auth.users.id` y conserva fallback para esquemas legacy con `user_id`.
- Security helpers: resolucion de perfil compatible con `id` y `user_id`.
- Cifrado: se agrego tag HMAC y validacion obligatoria antes de desencriptar.
- Browser safety: `supabaseAdmin` ahora falla explicitamente si alguien intenta usarlo desde el cliente.
- Cluster: IDs, calculo de health, seleccion de primary y quorum corregidos.
- Frontend: `PlatformSalesAgent` deja de crashear por iconos faltantes (`FileText`, `Monitor`, `Play`, `Layout`).
- DB scale: nueva migracion idempotente `2026-06-13_tenant_scale_indexes.sql` para indices multi-tenant y hot paths.
- Tests: mocks de Supabase mas realistas y suite Vitest estable.

## Plan recomendado

### Fase 1: cerrar seguridad

- Auditar politicas RLS reales en Supabase y eliminar `tenant_id IS NULL` en tablas productivas.
- Crear Edge Functions para invitaciones, operaciones admin, AI analysis, pagos y cifrado/descifrado de secretos.
- Bloquear en CI cualquier import de `supabaseAdmin` fuera de backend.
- Agregar tests que fallen si `pg_policies` contiene `USING (true)` o `tenant_id IS NULL` en tablas sensibles.

### Fase 2: consistencia de datos

- Convertir `tenant_id` a `NOT NULL` por etapas: backfill auditado, validacion, constraint.
- Unificar `activities` y `activity_logs` o definir fronteras claras.
- Separar finanzas transaccionales de resumen calculado.
- Agregar constraints de status para leads, tasks, finances, invitations y calendar.

### Fase 3: performance

- Aplicar la migracion de indices en staging y revisar `EXPLAIN ANALYZE` de dashboards principales.
- Particionar o archivar tablas de alto crecimiento: activity logs, notifications, analytics, messages.
- Reducir bundle inicial con imports dinamicos para modulos pesados: Finance, Docs, Home, editor, xlsx y tiptap.

### Fase 4: producto

- Implementar AI lead analysis como job backend con rate limit y trazabilidad de costo.
- Implementar invitaciones reales con email service y tokens single-use.
- Implementar recordatorios de calendario por job programado.
- Completar invoicing/payment flows con auditoria financiera.

## Donde escalar primero

Para escalar con menor riesgo, el orden recomendado es:

1. Staging con migraciones completas y datos simulados por tenant.
2. RLS audit automatizado en CI.
3. Edge Functions para secretos y admin.
4. Indices y query profiling.
5. Jobs backend para workflows asincronicos.
6. Split de providers/contextos por ruta.

## Senales de alerta en produccion

- Usuarios que ven datos sin `tenant_id`.
- Queries de dashboard tardando mas de 500 ms en tablas con muchos tenants.
- Errores de hydration/runtime al navegar a paginas lazy-loaded.
- Notificaciones duplicadas o perdidas.
- Finanzas editadas sin historial.
- Credenciales o payment config accesibles desde payloads del cliente.

