## Plan de Continuación: Optimización y Migración de Proyectos

### Paso 1: Crear ProjectsContext (15 min)
1.  Crear `context/ProjectsContext.tsx` con lógica de caché y suscripciones en tiempo real.
2.  Migrar la lógica de datos de `Projects.tsx` al contexto.
3.  Asegurar que la navegación entre Proyectos y otras secciones sea instantánea.

### Paso 2: Unificar Tareas (20 min)
1.  Actualmente las tareas de proyectos viven en un JSON dentro de la tabla `projects`.
2.  Las tareas del calendario viven en la tabla `calendar_tasks`.
3.  **Objetivo**: Crear una vista o lógica para que las tareas de proyectos aparezcan en el Calendario y viceversa, o migrar las tareas de proyectos a una tabla relacional `project_tasks` vinculada.
4.  Por ahora, mantendremos la estructura JSON para no romper la UI compleja de "Fases" (Tasks Groups), pero la optimizaremos.

### Paso 3: Optimización Global (10 min)
1.  Envolver `App.tsx` con `ProjectsProvider`.
2.  Verificar que `Home` (Dashboard) consuma datos de los contextos para mostrar resúmenes rápidos sin recargar.

### Paso 4: Testing (5 min)
1.  Verificar creación de proyectos.
2.  Verificar persistencia al navegar.

Total estimado: 50 minutos

¿Empezamos por el Paso 1 (ProjectsContext)?