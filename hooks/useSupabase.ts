import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorLogger } from '../lib/errorLogger'

export function useSupabase<T = any>(table: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    errorLogger.log(`Inicializando hook Supabase para tabla: ${table}`)
    
    const fetchAndSubscribe = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Initial fetch
        errorLogger.supabase.query(table, 'fetch inicial')
        const { data: initial, error: err } = await supabase.from(table).select('*')
        
        if (err) {
          errorLogger.supabase.error(table, 'fetch inicial', err)
          setError(err.message)
        } else {
          errorLogger.supabase.query(table, 'fetch exitoso', initial?.length)
          setData(initial as T[])
        }
      } catch (err: any) {
        errorLogger.supabase.error(table, 'fetch inicial', err)
        setError(err.message || 'Error desconocido')
      } finally {
        setLoading(false)
      }

      // Realtime subscription
      try {
        errorLogger.log(`Configurando suscripción realtime para: ${table}`)
        const channel = supabase
          .channel(`${table}-changes`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            (payload) => {
              errorLogger.supabase.subscription(table, payload.eventType, payload)
              
              try {
                if (payload.eventType === 'INSERT') {
                  setData((prev) => [...prev, payload.new as T])
                } else if (payload.eventType === 'UPDATE') {
                  setData((prev) =>
                    prev.map((item: any) =>
                      item.id === payload.new.id ? payload.new : item
                    )
                  )
                } else if (payload.eventType === 'DELETE') {
                  setData((prev) =>
                    prev.filter((item: any) => item.id !== payload.old.id)
                  )
                }
              } catch (err) {
                errorLogger.error(`Error procesando cambio realtime en ${table}`, err)
              }
            }
          )
          .subscribe((status, err) => {
            if (err) {
              errorLogger.supabase.error(table, 'subscription', err)
              setError(`Error de suscripción: ${err.message}`)
            } else if (status === 'SUBSCRIBED') {
              errorLogger.log(`Suscripción activa para ${table}`)
            }
          })

        return () => {
          errorLogger.log(`Limpiando suscripción para ${table}`)
          supabase.removeChannel(channel)
        }
      } catch (err: any) {
        errorLogger.supabase.error(table, 'subscription setup', err)
        setError(`Error configurando suscripción: ${err.message}`)
      }
    }

    fetchAndSubscribe()
  }, [table])

  const add = async (record: Omit<T, 'id'>) => {
    try {
      errorLogger.supabase.query(table, 'add', record)
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...(record as any), owner_id: user?.id ?? null }
      const { error: err } = await supabase.from(table).insert(payload)
      if (err) {
        errorLogger.supabase.error(table, 'add', err)
        throw err
      }
      errorLogger.supabase.query(table, 'add exitoso')
    } catch (err: any) {
      errorLogger.error(`Error en add de ${table}`, err)
      throw err
    }
  }

  const update = async (id: string, updates: Partial<T>) => {
    try {
      errorLogger.supabase.query(table, 'update', { id, updates })
      const { error: err } = await supabase.from(table).update(updates).eq('id', id)
      if (err) {
        errorLogger.supabase.error(table, 'update', err)
        throw err
      }
      errorLogger.supabase.query(table, 'update exitoso')
    } catch (err: any) {
      errorLogger.error(`Error en update de ${table}`, err)
      throw err
    }
  }

  const remove = async (id: string) => {
    try {
      errorLogger.supabase.query(table, 'remove', id)
      const { error: err } = await supabase.from(table).delete().eq('id', id)
      if (err) {
        errorLogger.supabase.error(table, 'remove', err)
        throw err
      }
      errorLogger.supabase.query(table, 'remove exitoso')
    } catch (err: any) {
      errorLogger.error(`Error en remove de ${table}`, err)
      throw err
    }
  }

  return { data, loading, error, add, update, remove }
}
