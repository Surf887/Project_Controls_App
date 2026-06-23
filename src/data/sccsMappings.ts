/**
 * Default WBS / CBS / phase → ISO 19008 SCCS mapping rules.
 * Project WBS stays unique (ISO 19008 §1); these rules bridge to SCCS facets.
 */

import type { ExtractedValue } from './projectData'
import type { ProjectPhase } from '../store/types'
import type { SccsAssignment } from './sccs'
import { formatCompositeCode } from './sccs'

export interface WbsPbsRule {
  wbsPrefix: string
  pbs: string
}

export interface CbsCorRule {
  cbsPrefix: string
  cor: string
}

export interface PhaseSabRule {
  phase: ProjectPhase
  sab: string
}

export interface CategorySabRule {
  category: ExtractedValue['category']
  sab: string
}

/** Longest-prefix WBS match wins. */
export const defaultWbsPbsRules: WbsPbsRule[] = [
  { wbsPrefix: 'P.04', pbs: 'AAC' },
  { wbsPrefix: 'P.', pbs: 'AAC' },
  { wbsPrefix: 'U.', pbs: 'AAD' },
  { wbsPrefix: 'CN', pbs: 'AAC' },
  { wbsPrefix: 'MR', pbs: 'AAC' },
  { wbsPrefix: 'A.', pbs: 'AAC' },
  { wbsPrefix: 'B.', pbs: 'BA' },
  { wbsPrefix: 'C.', pbs: 'BCA' },
]

export const defaultCbsCorRules: CbsCorRule[] = [
  { cbsPrefix: 'C-1000', cor: 'HT' },
  { cbsPrefix: 'C-1100', cor: 'ERV' },
  { cbsPrefix: 'C-1200', cor: 'ERP' },
  { cbsPrefix: 'C-1300', cor: 'HT' },
  { cbsPrefix: 'C-2000', cor: 'K' },
  { cbsPrefix: 'C-2100', cor: 'BP' },
  { cbsPrefix: 'C-2200', cor: 'HT' },
  { cbsPrefix: 'C-3000', cor: 'A' },
  { cbsPrefix: 'C-5000', cor: 'ER' },
  { cbsPrefix: 'C-6000', cor: 'A' },
  { cbsPrefix: 'C-7000', cor: 'A' },
  { cbsPrefix: 'C-8000', cor: 'A' },
  { cbsPrefix: 'C-9000', cor: 'A' },
]

export const defaultPhaseSabRules: PhaseSabRule[] = [
  { phase: 'Engineering', sab: 'KE' },
  { phase: 'Procurement', sab: 'KC' },
  { phase: 'Construction', sab: 'KD' },
  { phase: 'Commissioning', sab: 'KF' },
]

export const defaultCategorySabRules: CategorySabRule[] = [
  { category: 'progress', sab: 'KD' },
  { category: 'procurement', sab: 'KC' },
  { category: 'forecast', sab: 'KH' },
  { category: 'change', sab: 'KH' },
  { category: 'cost', sab: 'KD' },
]

function matchPrefix(value: string, prefix: string): boolean {
  return value === prefix || value.startsWith(`${prefix}.`) || value.startsWith(prefix)
}

export function resolvePbsFromWbs(wbs: string, rules = defaultWbsPbsRules): string {
  const sorted = [...rules].sort((a, b) => b.wbsPrefix.length - a.wbsPrefix.length)
  for (const rule of sorted) {
    if (matchPrefix(wbs, rule.wbsPrefix)) {
      return rule.pbs
    }
  }
  return 'AAC'
}

export function resolveCorFromCbs(cbs: string, rules = defaultCbsCorRules): string {
  const sorted = [...rules].sort((a, b) => b.cbsPrefix.length - a.cbsPrefix.length)
  for (const rule of sorted) {
    if (cbs.startsWith(rule.cbsPrefix)) {
      return rule.cor
    }
  }
  return 'A'
}

export function resolveSabFromPhase(phase: ProjectPhase, rules = defaultPhaseSabRules): string {
  return rules.find((rule) => rule.phase === phase)?.sab ?? 'KH'
}

export function resolveSabFromCategory(
  category: ExtractedValue['category'],
  rules = defaultCategorySabRules,
): string {
  return rules.find((rule) => rule.category === category)?.sab ?? 'KH'
}

export function buildSccsAssignment(input: {
  wbs: string
  cbs: string
  phase?: ProjectPhase
  category?: ExtractedValue['category']
  manual?: Partial<Pick<SccsAssignment, 'pbs' | 'sab' | 'cor'>>
  source?: SccsAssignment['source']
}): SccsAssignment {
  const pbs = input.manual?.pbs ?? resolvePbsFromWbs(input.wbs)
  const sab =
    input.manual?.sab ??
    (input.phase
      ? resolveSabFromPhase(input.phase)
      : input.category
        ? resolveSabFromCategory(input.category)
        : 'KH')
  const cor = input.manual?.cor ?? resolveCorFromCbs(input.cbs)
  return {
    pbs,
    sab,
    cor,
    composite: formatCompositeCode(pbs, sab, cor),
    source: input.source ?? 'mapped',
  }
}
