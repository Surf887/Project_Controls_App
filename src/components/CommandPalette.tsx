import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navGroups } from '../data/navigationModel'
import { monthlyClosePath, pathForView } from '../routes/viewPaths'
import { costControlLogCount, costControlLogPath } from '../data/costControlLogs'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const items = useMemo(() => {
    const navItems = navGroups.flatMap((group) =>
      group.items.map((item) => ({
        id: item.id,
        label: item.label,
        eyebrow: `${group.group} · ${item.eyebrow}`,
        path: pathForView(item.id),
        keywords: [group.group, item.label, item.eyebrow, item.id],
      })),
    )

    return [
      {
        id: 'monthly-close',
        label: 'Monthly close workspace',
        eyebrow: 'Guided month-end cycle',
        path: monthlyClosePath,
        keywords: ['close', 'monthly', 'cycle', 'accruals', 'forecast'],
      },
      {
        id: 'exports',
        label: 'Export centre',
        eyebrow: 'Excel / PDF close packs',
        path: '/exports',
        keywords: ['export', 'excel', 'pdf', 'report'],
      },
      {
        id: 'control-logs',
        label: `${costControlLogCount} cost control logs`,
        eyebrow: 'Budget · PO · claims · FX · lessons',
        path: costControlLogPath,
        keywords: ['logs', 'register', 'budget', 'commitment', 'accrual', 'contingency', 'claims', 'fx', 'lessons', 'moc'],
      },
      {
        id: 'pmo',
        label: 'PMO dashboard',
        eyebrow: 'Portfolio governance',
        path: '/admin/pmo',
        keywords: ['pmo', 'portfolio', 'governance', 'cpi'],
      },
      {
        id: 'workflows',
        label: 'Workflow admin',
        eyebrow: 'Delegations & SLAs',
        path: '/admin/workflows',
        keywords: ['workflow', 'delegation', 'sla', 'approval'],
      },
      {
        id: 'audit',
        label: 'Audit trail',
        eyebrow: 'Workflow history',
        path: pathForView('audit-trail'),
        keywords: ['audit', 'history', 'trail'],
      },
      ...navItems,
    ]
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return items.slice(0, 12)
    }
    return items
      .filter((item) =>
        [item.label, item.eyebrow, ...item.keywords].some((part) => part.toLowerCase().includes(q)),
      )
      .slice(0, 12)
  }, [items, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  if (!open) {
    return null
  }

  function go(path: string) {
    navigate(path)
    onClose()
  }

  return (
    <div className="command-palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="command-palette"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
        data-testid="command-palette"
      >
        <input
          autoFocus
          className="command-palette-input"
          placeholder="Search views, close steps, exports… (Ctrl+K)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onClose()
            }
            if (event.key === 'Enter' && filtered[0]) {
              go(filtered[0].path)
            }
          }}
        />
        <ul className="command-palette-results">
          {filtered.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => go(item.path)}>
                <span>{item.label}</span>
                <small>{item.eyebrow}</small>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="muted">No matches</li>}
        </ul>
      </div>
    </div>
  )
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return { open, setOpen, close: () => setOpen(false) }
}
