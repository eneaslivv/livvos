# Supabase Integration for eneas-os

## Instalación

1. Copia el schema SQL desde `supabase_schema.sql` y ejecútalo en tu proyecto de Supabase.
2. Asegúrate de tener las variables de entorno en `.env.local`:
   ```
   VITE_SUPABASE_URL=https://yjxjyxhksedwfeueduwl.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDM2ODg1MDAsImV4cCI6MjAxOTI2NDUwMH0.dummy_key_for_demo
   ```

## Uso

El proyecto ahora utiliza Supabase en lugar de Firebase para:
- **Proyectos**: CRUD completo con tiempo real
- **Ideas**: Crear, actualizar, eliminar con filtros
- **Actividad**: Feed de actividad con filtros por tipo
- **Ventas**: CRM con leads y analytics

## Características

- ✅ Suscripciones en tiempo real
- ✅ CRUD operations
- ✅ Filtros y búsquedas
- ✅ Esquema de base de datos optimizado
- ✅ Fallback a datos demo si no hay conexión

## Próximos pasos

- [ ] Autenticación de usuarios
- [ ] Políticas de seguridad (RLS)
- [ ] Storage para archivos
- [ ] Funciones edge para AI