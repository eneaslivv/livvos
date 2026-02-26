import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { useAuth } from '../hooks/useAuth'
import { errorLogger } from '../lib/errorLogger'

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout waiting for ${label}`)), ms)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

const getMissingColumn = (message: string) => {
  const match = message.match(/column\s+"([^"]+)"\s+does\s+not\s+exist/i)
  return match?.[1] || null
}

type UseSupabaseOptions = {
  enabled?: boolean
  subscribe?: boolean
  select?: string
  revalidate?: boolean
}

const dataCache = new Map<string, any[]>()

// Global tenant ID cache — shared across all useSupabase instances to avoid
// redundant profile queries (previously each hook resolved independently)
let _tenantIdCache: string | null = null
let _tenantIdPromise: Promise<string | null> | null = null
let _tenantIdUserId: string | null = null // track which user the cache belongs to

const tenantScopedTables = new Set([
  'projects',
  'tasks',
  'documents',
  'leads',
  'clients',
  'activity_logs',
  'calendar_events',
  'calendar_tasks',
  'finances',
  'user_vision',
  'user_thoughts',
  'passwords'
])

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function useSupabase<T = any>(table: string, options: UseSupabaseOptions = {}) {
  const { currentTenant, isLoading: tenantLoading } = useTenant()
  const { user, loading: authLoading } = useAuth()
  const { enabled = true, subscribe = true, select = '*', revalidate = true } = options
  const cacheKey = `${table}:${currentTenant?.id || user?.id || 'anon'}:${select}`

  // Initialize from cache so we never flash a loading spinner when data exists
  const initialCache = dataCache.get(cacheKey) as T[] | undefined
  const [data, setData] = useState<T[]>(() => initialCache || [])
  const [loading, setLoading] = useState(() => !initialCache)
  const [error, setError] = useState<string | null>(null)

  const resolveTenantId = async () => {
    if (currentTenant?.id) {
      // Update global cache when context provides tenant
      _tenantIdCache = currentTenant.id
      _tenantIdUserId = user?.id || null
      return currentTenant.id
    }
    if (!user?.id) return null

    // If cache is for a different user, invalidate
    if (_tenantIdUserId !== user.id) {
      _tenantIdCache = null
      _tenantIdPromise = null
      _tenantIdUserId = null
    }

    // Return cached tenant ID immediately
    if (_tenantIdCache) return _tenantIdCache

    // Deduplicate: if another hook is already resolving, reuse the same promise
    if (_tenantIdPromise) return _tenantIdPromise

    _tenantIdPromise = (async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .single()

        if (!profileError && profile?.tenant_id) {
          _tenantIdCache = profile.tenant_id as string
          _tenantIdUserId = user.id
          _tenantIdPromise = null
          return _tenantIdCache
        }

        if (attempt < 3) {
          await sleep(100)
        }
      }

      _tenantIdPromise = null
      return null
    })()

    return _tenantIdPromise
  }

  useEffect(() => {
    errorLogger.log(`Inicializando hook Supabase para tabla: ${table}`)
    if (authLoading) return

    if (!enabled) {
      setLoading(false)
      return
    }

    if (!user) {
      setData([])
      setLoading(false)
      return
    }

    // For tenant-scoped tables, wait for TenantContext to finish loading
    // instead of doing redundant profile queries and retry loops
    if (tenantScopedTables.has(table) && tenantLoading) {
      return
    }

    let isMounted = true
    let cleanup: (() => void) | undefined

    const hasCache = dataCache.has(cacheKey)
    if (hasCache) {
      const cached = dataCache.get(cacheKey) as T[]
      setData(cached)
      setLoading(false)
      if (!revalidate) {
        return
      }
    }

    const fetchAndSubscribe = async () => {
      const requiresTenant = tenantScopedTables.has(table)
      const tenantId = currentTenant?.id || null

      if (requiresTenant && !tenantId) {
        errorLogger.warn(`No tenant available for ${table}, fetching without tenant filter`)
      }

      if (!hasCache) {
        setLoading(true)
      }
      setError(null)

      try {
        // Initial fetch
        errorLogger.supabase.query(table, 'fetch inicial')
        const initialQuery = supabase.from(table).select(select)
        if (tenantId) {
          initialQuery.eq('tenant_id', tenantId)
        }
        const { data: initial, error: err } = await withTimeout(
          Promise.resolve(initialQuery),
          15000,
          `${table} fetch`
        )

        if (!isMounted) return

        if (err) {
          const errMsg = err.message || ''
          const missingColumn = getMissingColumn(errMsg)

          // Handle case where tenant_id column doesn't exist on this table
          if (missingColumn === 'tenant_id' && tenantId) {
            errorLogger.warn(`Column tenant_id missing on ${table}; retrying without tenant filter.`)
            const noTenantQuery = supabase.from(table).select(select)
            const { data: noTenantData, error: noTenantError } = await withTimeout(
              Promise.resolve(noTenantQuery),
              15000,
              `${table} fetch (no tenant)`
            )
            if (!isMounted) return
            if (!noTenantError) {
              setData(noTenantData as T[])
              dataCache.set(cacheKey, (noTenantData as T[]) || [])
            } else {
              errorLogger.supabase.error(table, 'fetch (no tenant)', noTenantError)
              setError(noTenantError.message)
            }
            return
          }

          if (missingColumn && select !== '*') {
            errorLogger.warn(`Missing column ${missingColumn} on ${table}; retrying fetch with *.`)
            const fallbackQuery = supabase.from(table).select('*')
            if (tenantId) {
              fallbackQuery.eq('tenant_id', tenantId)
            }
            const { data: fallback, error: fallbackError } = await withTimeout(
              Promise.resolve(fallbackQuery),
              15000,
              `${table} fetch fallback`
            )
            if (!isMounted) return
            if (fallbackError) {
              // If fallback also fails due to missing tenant_id, retry without tenant
              const fb2Missing = getMissingColumn(fallbackError.message || '')
              if (fb2Missing === 'tenant_id' && tenantId) {
                const fb2Query = supabase.from(table).select('*')
                const { data: fb2Data, error: fb2Error } = await withTimeout(
                  Promise.resolve(fb2Query), 15000, `${table} fetch fallback (no tenant)`
                )
                if (!isMounted) return
                if (!fb2Error) {
                  setData(fb2Data as T[])
                  dataCache.set(cacheKey, (fb2Data as T[]) || [])
                } else {
                  setError(fb2Error.message)
                }
                return
              }
              errorLogger.supabase.error(table, 'fetch inicial fallback', fallbackError)
              setError(fallbackError.message)
            } else {
              errorLogger.supabase.query(table, 'fetch exitoso (fallback)', fallback?.length)
              setData(fallback as T[])
              dataCache.set(cacheKey, (fallback as T[]) || [])
            }
            return
          }

          errorLogger.supabase.error(table, 'fetch inicial', err)
          setError(errMsg)
        } else {
          errorLogger.supabase.query(table, 'fetch exitoso', initial?.length)
          setData(initial as T[])
          dataCache.set(cacheKey, (initial as T[]) || [])
        }
      } catch (err: any) {
        if (!isMounted) return
        errorLogger.supabase.error(table, 'fetch inicial', err)
        setError(err.message || 'Error desconocido')
      } finally {
        if (isMounted) setLoading(false)
      }

      if (!subscribe) {
        return
      }

      // Realtime subscription
      try {
        errorLogger.log(`Configurando suscripción realtime para: ${table}`)
        const channel = supabase
          .channel(`${table}-changes${tenantId ? `-${tenantId}` : ''}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table, ...(tenantId ? { filter: `tenant_id=eq.${tenantId}` } : {}) },
            (payload) => {
              errorLogger.supabase.subscription(table, payload.eventType, payload)

              try {
                if (payload.eventType === 'INSERT') {
                  setData((prev) => {
                    const exists = prev.some((item: any) => item.id === payload.new.id)
                    if (exists) {
                      const next = prev.map((item: any) =>
                        item.id === payload.new.id ? ({ ...item, ...(payload.new as T) } as T) : item
                      )
                      dataCache.set(cacheKey, next)
                      return next
                    }
                    const next = [...prev, payload.new as T]
                    dataCache.set(cacheKey, next)
                    return next
                  })
                } else if (payload.eventType === 'UPDATE') {
                  setData((prev) => {
                    let updated = false
                    const next = prev.map((item: any) => {
                      if (item.id === payload.new.id) {
                        updated = true
                        return { ...item, ...(payload.new as T) } as T
                      }
                      return item
                    })
                    const resolved = updated ? next : [...next, payload.new as T]
                    dataCache.set(cacheKey, resolved)
                    return resolved
                  })
                } else if (payload.eventType === 'DELETE') {
                  setData((prev) => {
                    const next = prev.filter((item: any) => item.id !== payload.old.id)
                    dataCache.set(cacheKey, next)
                    return next
                  })
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

        cleanup = () => {
          errorLogger.log(`Limpiando suscripción para ${table}`)
          supabase.removeChannel(channel)
        }
      } catch (err: any) {
        if (!isMounted) return
        errorLogger.supabase.error(table, 'subscription setup', err)
        setError(`Error configurando suscripción: ${err.message}`)
      }
    }

    fetchAndSubscribe()

    return () => {
      isMounted = false
      cleanup?.()
    }
  }, [table, user?.id, currentTenant?.id, authLoading, tenantLoading, enabled, subscribe, select, revalidate])

  const add = async (record: Omit<T, 'id'>) => {
    try {
      errorLogger.supabase.query(table, 'add', record)
      const requiresTenant = tenantScopedTables.has(table)
      const tenantId = requiresTenant ? await resolveTenantId() : currentTenant?.id || null
      if (requiresTenant && !tenantId) {
        errorLogger.warn(`Tenant not resolved for ${table} insert — will attempt without tenant_id`)
      }
      const basePayload = { ...(record as any) }
      const metaPayload = {
        ...(user?.id ? { owner_id: user.id } : {}),
        ...(tenantId ? { tenant_id: tenantId } : {})
      }

      const payload = { ...basePayload, ...metaPayload }
      // Use the same select columns as the initial fetch so we get a full row back
      const selectCols = select || '*'
      const insertResult = await withTimeout(
        Promise.resolve(supabase.from(table).insert(payload).select(selectCols)),
        15000,
        `${table} insert`
      )
      const { data: inserted, error: err } = insertResult as { data: T[] | null; error: { message?: string } | null }
      if (err) {
        const message = err.message || ''
        errorLogger.supabase.error(table, 'add', err)

        const missingColumn = getMissingColumn(message)
        if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
          const { [missingColumn]: _omitted, ...retryPayload } = payload as any
          errorLogger.warn(`Missing column ${missingColumn} on ${table}; retrying without it.`)
          const retryResult = await withTimeout(
            Promise.resolve(supabase.from(table).insert(retryPayload).select(selectCols)),
            15000,
            `${table} insert retry`
          )
          const { data: retryInserted, error: retryError } = retryResult as { data: T[] | null; error: { message?: string } | null }
          if (retryError) {
            errorLogger.supabase.error(table, 'add retry (missing column)', retryError)
            throw retryError
          }
          if (retryInserted?.length) {
            setData((prev) => {
              const next = [...prev]
              retryInserted.forEach((row: any) => {
                const exists = next.some((item: any) => item.id === row.id)
                if (exists) {
                  for (let i = 0; i < next.length; i += 1) {
                    if ((next[i] as any).id === row.id) {
                      next[i] = row
                      break
                    }
                  }
                } else {
                  next.push(row)
                }
              })
              dataCache.set(cacheKey, next)
              return next
            })
          }
          errorLogger.supabase.query(table, 'add exitoso (missing column retry)')
          return
        }

        if (message.includes('column') && (message.includes('tenant_id') || message.includes('owner_id'))) {
          if (tenantScopedTables.has(table)) {
            throw new Error(`Missing required columns on ${table}. Run the tenant/owner migration before creating data.`)
          }

          const { data: retryData, error: retryError } = await supabase.from(table).insert(basePayload).select(selectCols)
          if (retryError) {
            errorLogger.supabase.error(table, 'add retry', retryError)
            throw retryError
          }
          if (retryData && retryData.length) {
            setData((prev) => {
              const next = [...prev]
              retryData.forEach((row: any) => {
                const exists = next.some((item: any) => item.id === row.id)
                if (!exists) next.push(row)
              })
              dataCache.set(cacheKey, next)
              return next
            })
          }
          errorLogger.supabase.query(table, 'add exitoso (retry)')
          return
        }

        if (message.includes('row-level security')) {
          throw new Error('RLS blocked the insert. Missing role/permission to create records.')
        }

        throw err
      }
      // Use inserted data directly (now contains full row), fallback to payload with generated id
      const nextInserted = inserted?.length ? inserted : ((payload as any).id ? [(payload as T)] : [])
      if (nextInserted.length) {
        setData((prev) => {
          const next = [...prev]
          nextInserted.forEach((row: any) => {
            const exists = next.some((item: any) => item.id === row.id)
            if (exists) {
              for (let i = 0; i < next.length; i += 1) {
                if ((next[i] as any).id === row.id) {
                  next[i] = row
                  break
                }
              }
            } else {
              next.push(row)
            }
          })
          dataCache.set(cacheKey, next)
          return next
        })
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
        const message = err.message || ''
        errorLogger.supabase.error(table, 'update', err)

        const missingColumn = getMissingColumn(message)
        if (missingColumn && Object.prototype.hasOwnProperty.call(updates, missingColumn)) {
          const { [missingColumn]: _omitted, ...retryUpdates } = updates as any
          if (Object.keys(retryUpdates).length === 0) {
            setData((prev) => {
              const next = prev.map((item: any) =>
                item.id === id ? { ...item, ...updates } : item
              )
              dataCache.set(cacheKey, next)
              return next
            })
            errorLogger.warn(`Skipped update for missing column ${missingColumn} on ${table}; updated locally.`)
            return
          }

          const { error: retryError } = await supabase.from(table).update(retryUpdates).eq('id', id)
          if (retryError) {
            errorLogger.supabase.error(table, 'update retry (missing column)', retryError)
            throw retryError
          }
          setData((prev) => {
            const next = prev.map((item: any) =>
              item.id === id ? { ...item, ...updates } : item
            )
            dataCache.set(cacheKey, next)
            return next
          })
          errorLogger.supabase.query(table, 'update exitoso (missing column retry)')
          return
        }

        throw err
      }
      setData((prev) => {
        const next = prev.map((item: any) =>
          item.id === id ? { ...item, ...updates } : item
        )
        dataCache.set(cacheKey, next)
        return next
      })
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

  const refresh = async () => {
    // Only show loading spinner if we have no data yet (stale-while-revalidate)
    const hasData = data.length > 0 || dataCache.has(cacheKey)
    if (!hasData) setLoading(true)
    try {
      const requiresTenant = tenantScopedTables.has(table)
      const tenantId = requiresTenant ? await resolveTenantId() : currentTenant?.id || null

      const refreshQuery = supabase.from(table).select(select)
      if (tenantId) {
        refreshQuery.eq('tenant_id', tenantId)
      }
      const { data: refreshed, error: err } = await refreshQuery
      if (err) {
        const missingColumn = getMissingColumn(err.message || '')
        // Handle missing tenant_id column
        if (missingColumn === 'tenant_id' && tenantId) {
          const noTenantQuery = supabase.from(table).select(select)
          const { data: noTenantData, error: noTenantError } = await noTenantQuery
          if (noTenantError) throw noTenantError
          setData(noTenantData as T[])
          dataCache.set(cacheKey, (noTenantData as T[]) || [])
          return
        }
        if (missingColumn && select !== '*') {
          const fallbackQuery = supabase.from(table).select('*')
          if (tenantId) {
            fallbackQuery.eq('tenant_id', tenantId)
          }
          const { data: fallback, error: fallbackError } = await fallbackQuery
          if (fallbackError) {
            // If fallback also fails due to tenant_id, retry without
            if (getMissingColumn(fallbackError.message || '') === 'tenant_id') {
              const { data: fb2, error: fb2Err } = await supabase.from(table).select('*')
              if (fb2Err) throw fb2Err
              setData(fb2 as T[])
              dataCache.set(cacheKey, (fb2 as T[]) || [])
              return
            }
            throw fallbackError
          }
          setData(fallback as T[])
          dataCache.set(cacheKey, (fallback as T[]) || [])
          return
        }
        throw err
      }
      setData(refreshed as T[])
      dataCache.set(cacheKey, (refreshed as T[]) || [])
    } catch (err: any) {
      errorLogger.supabase.error(table, 'refresh', err)
      setError(err.message)
    } finally {
      if (!hasData) setLoading(false)
    }
  }

  return { data, loading, error, add, update, remove, refresh }
}
