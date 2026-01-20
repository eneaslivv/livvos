// Logger de errores para debugging
export const errorLogger = {
  log: (message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] 📝 ${message}`, data || '');
  },
  
  error: (message: string, error?: any) => {
    console.error(`[${new Date().toISOString()}] ❌ ${message}`, error || '');
  },
  
  warn: (message: string, data?: any) => {
    console.warn(`[${new Date().toISOString()}] ⚠️  ${message}`, data || '');
  },
  
  info: (message: string, data?: any) => {
    console.info(`[${new Date().toISOString()}] ℹ️  ${message}`, data || '');
  },
  
  // Logger específico para Supabase
  supabase: {
    query: (table: string, operation: string, data?: any) => {
      console.log(`[${new Date().toISOString()}] 🗄️  Supabase: ${operation} ${table}`, data || '');
    },
    
    error: (table: string, operation: string, error: any) => {
      console.error(`[${new Date().toISOString()}] 🗄️  Supabase Error: ${operation} ${table}`, error);
    },
    
    subscription: (table: string, event: string, data?: any) => {
      console.log(`[${new Date().toISOString()}] 📡 Supabase Subscription: ${event} ${table}`, data || '');
    }
  }
};

// Helper para envolver funciones con try-catch y logging
export function withErrorLogging<T extends (...args: any[]) => any>(
  fn: T,
  context: string
): T {
  return ((...args: Parameters<T>) => {
    try {
      errorLogger.log(`Ejecutando: ${context}`, args);
      const result = fn(...args);
      
      // Si es una promesa, loggear el resultado
      if (result instanceof Promise) {
        return result
          .then(res => {
            errorLogger.log(`Éxito: ${context}`, res);
            return res;
          })
          .catch(err => {
            errorLogger.error(`Error en ${context}`, err);
            throw err;
          });
      }
      
      errorLogger.log(`Éxito: ${context}`, result);
      return result;
    } catch (error) {
      errorLogger.error(`Error en ${context}`, error);
      throw error;
    }
  }) as T;
}