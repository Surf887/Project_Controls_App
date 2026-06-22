import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteSavedFilter, fetchSavedFilters, saveSavedFilter, type SavedFilterRecord } from '../api/client'
import { viewPaths, pathForView } from '../routes/viewPaths'
import type { NavView } from '../data/navigationModel'

export interface SavedFilter {
  id: string
  name: string
  scope: string
  payload: Record<string, string>
  savedAt: string
}

const storageKey = (scope: string) => `pc-saved-filters:${scope}`

function mapRecord(record: SavedFilterRecord): SavedFilter {
  return {
    id: record.id,
    name: record.name,
    scope: record.scope,
    payload: record.payload,
    savedAt: record.createdAt,
  }
}

export function useSavedFilters(scope: string, serverBacked = true) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [source, setSource] = useState<'server' | 'local'>('local')

  const reload = useCallback(async () => {
    if (serverBacked) {
      try {
        const rows = await fetchSavedFilters(scope)
        setFilters(rows.map(mapRecord))
        setSource('server')
        return
      } catch {
        /* fall through to localStorage */
      }
    }
    try {
      setFilters(JSON.parse(localStorage.getItem(storageKey(scope)) ?? '[]') as SavedFilter[])
      setSource('local')
    } catch {
      setFilters([])
      setSource('local')
    }
  }, [scope, serverBacked])

  useEffect(() => {
    void reload()
  }, [reload])

  function persistLocal(next: SavedFilter[]) {
    localStorage.setItem(storageKey(scope), JSON.stringify(next))
    setFilters(next)
    setSource('local')
  }

  async function saveFilter(name: string, payload: Record<string, string>) {
    if (serverBacked) {
      try {
        const record = await saveSavedFilter({ name, scope, payload })
        setFilters((prev) => [mapRecord(record), ...prev])
        setSource('server')
        return
      } catch {
        /* fall through */
      }
    }
    const entry: SavedFilter = {
      id: crypto.randomUUID(),
      name,
      scope,
      payload,
      savedAt: new Date().toISOString(),
    }
    persistLocal([entry, ...filters])
  }

  function applyFilter(filter: SavedFilter) {
    const view = filter.payload.view as NavView | undefined
    if (view && view in viewPaths) {
      const params = new URLSearchParams(filter.payload)
      params.delete('view')
      navigate(`${pathForView(view)}?${params.toString()}`)
    }
  }

  async function removeFilter(id: string) {
    if (source === 'server') {
      try {
        await deleteSavedFilter(id)
        setFilters((prev) => prev.filter((f) => f.id !== id))
        return
      } catch {
        /* fall through */
      }
    }
    persistLocal(filters.filter((f) => f.id !== id))
  }

  return { filters, saveFilter, applyFilter, removeFilter, reload, source }
}
