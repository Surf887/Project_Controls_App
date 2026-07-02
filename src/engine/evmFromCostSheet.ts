import type { CostRow } from '../data/costSheet'
import type { EvmAccount, EvmResult } from '../data/intelligence'
import type { ProgressCreditEntry, RuleOfCreditTemplate } from '../store/types'
import { CURRENT_PERIOD_INDEX, PERIODS } from '../data/costSheet'
import { controlAccountRows } from './costAggregation'
import { wbsEarnedPercent } from './rulesOfCredit'

export type EvmEacMethod = 'bac_cpi' | 'ac_plus_remaining' | 'engine_most_likely'

/**
 * Resolve the reporting period label (e.g. `settings.reportingPeriod.period`)
 * to an index into PERIODS. Unknown/absent labels fall back to the calendar
 * default so a renamed period cannot silently zero out PV.
 */
export function resolvePeriodIndex(currentPeriod?: string): number {
  if (currentPeriod) {
    const index = PERIODS.indexOf(currentPeriod)
    if (index >= 0) {
      return index
    }
  }
  return CURRENT_PERIOD_INDEX
}

export function costSheetToEvmAccounts(
  rows: CostRow[],
  options?: {
    templates?: RuleOfCreditTemplate[]
    progressCredits?: ProgressCreditEntry[]
    /** Reporting period label driving planned value (PV); defaults to the seed calendar's current period. */
    currentPeriod?: string
  },
): EvmAccount[] {
  const templates = options?.templates ?? []
  const progressCredits = options?.progressCredits ?? []
  // Planned progress tracks the open reporting period instead of a hardcoded
  // month so PV/SPI stay correct when the period rolls forward.
  const periodIndex = resolvePeriodIndex(options?.currentPeriod)
  const plannedProgress = (periodIndex + 1) / PERIODS.length

  return controlAccountRows(rows).map((row) => {
      const bac = row.originalBudget + row.approvedChanges
      const ac = row.actualsToDate

      const rocEarned = wbsEarnedPercent(row.wbs, templates, progressCredits)
      // Without rules-of-credit data, fall back to a cost-ratio proxy capped at
      // 95% so a control account never reports complete on spend alone.
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
