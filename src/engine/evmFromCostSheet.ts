import type { CostRow } from '../data/costSheet'
import type { EvmAccount, EvmResult } from '../data/intelligence'
import type { ProgressCreditEntry, RuleOfCreditTemplate } from '../store/types'
import { PERIODS } from '../data/costSheet'
import { controlAccountRows } from './costAggregation'
import { wbsEarnedPercent } from './rulesOfCredit'

export type EvmEacMethod = 'bac_cpi' | 'ac_plus_remaining' | 'engine_most_likely'

export function costSheetToEvmAccounts(
  rows: CostRow[],
  options?: {
    templates?: RuleOfCreditTemplate[]
    progressCredits?: ProgressCreditEntry[]
  },
): EvmAccount[] {
  const templates = options?.templates ?? []
  const progressCredits = options?.progressCredits ?? []

  return controlAccountRows(rows).map((row) => {
      const bac = row.originalBudget + row.approvedChanges
      const ac = row.actualsToDate
      const plannedProgress = PERIODS.filter((_, index) => index <= 5).length / PERIODS.length

      const rocEarned = wbsEarnedPercent(row.wbs, templates, progressCredits)
      const earnedRatio =
        rocEarned != null
          ? rocEarned / 100
          : bac === 0
            ? 0
            : Math.min(ac / bac, 0.95)

      const pv = bac * plannedProgress
      const ev = bac * earnedRatio

      return {
        wbs: row.wbs,
        description: row.description,
        discipline: row.discipline,
        bac,
        pv,
        ev,
        ac,
      }
    })
}

export function computeEvmWithMethod(
  account: EvmAccount,
  method: EvmEacMethod,
  engineEac?: number,
): EvmResult {
  const cpi = account.ac === 0 ? 0 : account.ev / account.ac
  const spi = account.pv === 0 ? 0 : account.ev / account.pv
  const cv = account.ev - account.ac
  const sv = account.ev - account.pv
  const remaining = Math.max(account.bac - account.ev, 0)

  let eac = account.bac
  switch (method) {
    case 'bac_cpi':
      eac = cpi === 0 ? account.bac : account.bac / cpi
      break
    case 'ac_plus_remaining':
      eac = account.ac + remaining
      break
    case 'engine_most_likely':
      eac = engineEac ?? account.ac + remaining
      break
  }

  const vac = account.bac - eac
  const percentComplete = account.bac === 0 ? 0 : (account.ev / account.bac) * 100

  return { ...account, cpi, spi, cv, sv, eac, vac, percentComplete }
}
