import type { NavView } from '../data/navigationModel'

/** URL paths for each workspace view — used by router, command palette, and monthly close steps. */
export const viewPaths: Record<NavView, string> = {
  dashboard: '/dashboard',
  portfolio: '/portfolio',
  basis: '/basis',
  wbs: '/wbs',
  'cost-structure': '/cost-structure',
  accruals: '/accruals',
  costsheet: '/cost-sheet',
  contingency: '/contingency',
  'forecast-engine': '/forecast',
  'forecast-approval': '/forecast/approval',
  'forecast-whatif': '/forecast/what-if',
  'rules-of-credit': '/vowd/rules-of-credit',
  controls: '/vowd/evm',
  predictive: '/vowd/predictive',
  'long-lead': '/commitments/long-lead',
  procurement: '/commitments/procurement',
  forex: '/commitments/forex',
  changes: '/changes',
  risks: '/risks',
  opportunities: '/opportunities',
  'decisions-log': '/decisions',
  'engineering-phase': '/epc/engineering',
  construction: '/epc/construction',
  commissioning: '/epc/commissioning',
  issues: '/issues',
  claims: '/claims',
  actions: '/actions',
  lessons: '/lessons',
  'team-reports': '/reports',
  'audit-trail': '/audit',
  ingestion: '/submissions/ingestion',
  review: '/submissions/review',
  validation: '/submissions/validation',
  lineage: '/submissions/lineage',
  integrations: '/admin/integrations',
  governance: '/admin/governance',
  engineering: '/admin/engineering-intel',
  model: '/admin/model-intel',
  reality: '/admin/reality',
  decisions: '/admin/strategy',
}

export const monthlyClosePath = '/close'
export const costControlLogsPath = '/logs'

export function pathForView(view: NavView): string {
  return viewPaths[view]
}

export function viewFromPath(pathname: string): NavView | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'

  if (normalized === monthlyClosePath || normalized === '/exports' || normalized === costControlLogsPath || normalized.startsWith('/item/')) {
    return null
  }
  if (normalized.startsWith('/audit/') && normalized !== '/audit') {
    return null
  }

  const entry = Object.entries(viewPaths).find(([, path]) => path === normalized)
  if (entry) {
    return entry[0] as NavView
  }

  if (normalized === '/') {
    return null
  }

  return null
}

export interface CommandItem {
  id: string
  label: string
  eyebrow: string
  path: string
  keywords: string[]
}

export function buildCommandIndex(): CommandItem[] {
  return Object.entries(viewPaths).map(([id, path]) => ({
    id,
    label: id.replace(/-/g, ' '),
    eyebrow: path,
    path,
    keywords: [id, path.replace(/\//g, ' ')],
  }))
}
