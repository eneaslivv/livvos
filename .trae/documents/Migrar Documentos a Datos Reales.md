## Plan Paso a Paso - Migrar Documentos a Datos Reales

### Paso 1: Crear Tablas y Storage (10 min)
1. Crear bucket 'documents' en Supabase Storage
2. Ejecutar SQL para tablas: folders, files, file_versions
3. Configurar RLS para acceso seguro

### Paso 2: Crear Hook useDocuments (10 min)
1. Hook para navegar carpetas (breadcrumbs)
2. Funciones para upload/download de archivos
3. Crear/mover/eliminar carpetas y archivos

### Paso 3: Migrar Componente Docs (15 min)
1. Reemplazar datos mock con hook useDocuments
2. Implementar navegación real de carpetas
3. Subida de archivos real con drag & drop
4. Vista previa de archivos

### Paso 4: Testing (5 min)
1. Verificar subida de archivos
2. Probar navegación y breadcrumbs
3. Confirmar permisos RLS

Total estimado: 40 minutos

¿Empezamos con el Paso 1?