import { buildRow, type CostRow } from '../data/costSheet'
import type {
  CostTransaction,
  CostTransactionBatch,
  CostTransactionIssue,
  CostTransactionType,
} from '../data/costTransactions'
import type { MappingProfile } from '../data/mappingProfiles'
import type { ProjectState } from '../store/types'
import { applyMappingProfile } from './dynamicMapping'
import { findOwningControlAccount } from './applyExtractionsCore'

export interface CostTransactionImportOptions {
  profile: MappingProfile
  headers: string[]
  rows: Record<string, string>[]
  existingTransactions: CostTransaction[]
  importedBy: string
  now?: string
  watermark?: string
}

function recordType(value: string): CostTransactionType | null {
  const normalized = value.trim().toLowerCase()
  if (['actual', 'actuals', 'posted', 'journal', 'gl'].includes(normalized)) return 'actual'
  if (['commitment', 'committed', 'po', 'purchase_order'].includes(normalized)) return 'commitment'
  if (['accrual', 'accrued'].includes(normalized)) return 'accrual'
  if (['invoice', 'invoiced'].includes(normalized)) return 'invoice'
  return null
}

function isoDate(value: string): string | null {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10)
}

function amount(value: string): number | null {
  const parsed = Number(value.replace(/[$,%\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function fiscalPeriod(value: string, postingDate: string): string {
  if (value.trim()) return value.trim()
  return new Date(`${postingDate}T00:00:00Z`)
    .toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .replace(' ', '-')
}

export function buildCostTransactionBatch(
  options: CostTransactionImportOptions,
  costRows: CostRow[],
): { batch: CostTransactionBatch; transactions: CostTransaction[] } {
  const mapped = applyMappingProfile(options.profile, options.headers, options.rows)
  const importedAt = options.now ?? new Date().toISOString()
  const batchId = `CTX-${Date.parse(importedAt)}`
  const issues: CostTransactionIssue[] = mapped.issues.map((issue) => ({
    row: issue.row,
    field: issue.field,
    severity: issue.severity,
    message: issue.message,
  }))
  const knownExternalIds = new Set(options.existingTransactions.map((transaction) => transaction.externalId))
  const seen = new Set<string>()
  const transactions: CostTransaction[] = []

  mapped.rows.forEach((row, index) => {
    const sourceRow = index + 2
    const externalId = row.externalId?.trim()
    const type = recordType(row.recordType ?? '')
    const postingDate = isoDate(row.postingDate ?? '')
    const parsedAmount = amount(row.amount ?? '')
    if (!externalId || !type || !postingDate || parsedAmount == null || !row.currency?.trim()) {
      issues.push({
        row: sourceRow,
        externalId,
        field: 'required',
        severity: 'error',
        message: 'External ID, record type, posting date, numeric amount, and currency are required.',
      })
      return
    }
    const duplicate = seen.has(externalId) || knownExternalIds.has(externalId)
    seen.add(externalId)
    if (duplicate) {
      issues.push({
        row: sourceRow,
        externalId,
        field: 'externalId',
        severity: 'warning',
        message: `Duplicate source transaction ${externalId} will not be posted again.`,
      })
    }
    const sourceWbs = row.wbs?.trim() ?? ''
    const account = findOwningControlAccount(costRows, sourceWbs)
    if (!account) {
      issues.push({
        row: sourceRow,
        externalId,
        field: 'wbs',
        severity: 'warning',
        message: `Source WBS ${sourceWbs || 'blank'} needs a control-account mapping.`,
      })
    }
    if (row.currency.trim().toUpperCase() !== 'USD') {
      issues.push({
        row: sourceRow,
        externalId,
        field: 'currency',
        severity: 'warning',
        message: `Currency ${row.currency.trim().toUpperCase()} cannot post until converted to reporting currency USD.`,
      })
    }
    transactions.push({
      id: `${batchId}:${externalId}`,
      batchId,
      sourceSystem: options.profile.sourceType === 'snowflake' ? 'snowflake' : 'csv',
      externalId,
      projectCode: row.projectCode?.trim() ?? '',
      sourceWbs,
      wbs: account?.wbs ?? 'UNMAPPED-WBS',
      cbs: row.cbs?.trim() || undefined,
      recordType: type,
      postingDate,
      fiscalPeriod: fiscalPeriod(row.fiscalPeriod ?? '', postingDate),
      amount: parsedAmount,
      currency: row.currency.trim().toUpperCase(),
      poNumber: row.poNumber?.trim() || undefined,
      vendor: row.vendor?.trim() || undefined,
      description: row.description?.trim() || undefined,
      sourceUpdatedAt: isoDate(row.updatedAt ?? '') ?? undefined,
      status: 'staged',
      mappingStatus: account ? 'mapped' : 'unmapped',
      duplicate,
    })
  })

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const acceptedTransactions = errorCount > 0 ? [] : transactions
  const batch: CostTransactionBatch = {
    id: batchId,
    sourceSystem: options.profile.sourceType === 'snowflake' ? 'snowflake' : 'csv',
    profileId: options.profile.id,
    profileVersion: options.profile.version,
    dataset: options.profile.dataset,
    importedAt,
    importedBy: options.importedBy,
    status: errorCount > 0 ? 'rejected' : 'staged',
    rowCount: acceptedTransactions.length,
    mappedCount: acceptedTransactions.filter((transaction) => transaction.mappingStatus === 'mapped').length,
    duplicateCount: acceptedTransactions.filter((transaction) => transaction.duplicate).length,
    errorCount,
    warningCount,
    watermark: options.watermark,
    issues,
  }
  return { batch, transactions: acceptedTransactions }
}

function rowWithTransaction(row: CostRow, transaction: CostTransaction): CostRow {
  if (transaction.recordType === 'commitment') {
    return buildRow({ ...row, commitments: row.commitments + transaction.amount })
  }
  if (transaction.recordType === 'actual' || transaction.recordType === 'invoice') {
    const periodIndex = row.periods.findIndex(
      (period) => period.period.toLowerCase() === transaction.fiscalPeriod.toLowerCase(),
    )
    const fallback = row.periods.findIndex(
      (period) =>
        period.period.toLowerCase() ===
        new Date(`${transaction.postingDate}T00:00:00Z`)
          .toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
          .replace(' ', '-')
          .toLowerCase(),
    )
    const index = periodIndex >= 0 ? periodIndex : fallback
    if (index < 0) return row
    return buildRow({
      ...row,
      periods: row.periods.map((period, current) =>
        current === index ? { ...period, actual: period.actual + transaction.amount } : period,
      ),
    })
  }
  return row
}

export function postCostTransactionBatch(
  state: ProjectState,
  batchId: string,
  actor: string,
): ProjectState {
  const batch = state.costTransactionBatches.find((entry) => entry.id === batchId)
  if (!batch || batch.status !== 'approved') return state
  const postable = state.costTransactions.filter(
    (transaction) =>
      transaction.batchId === batchId &&
      transaction.status === 'approved' &&
      transaction.mappingStatus === 'mapped' &&
      !transaction.duplicate,
  )
  let rows = state.costSheetRows
  postable.forEach((transaction) => {
    rows = rows.map((row) =>
      row.id === transaction.wbs ? rowWithTransaction(row, transaction) : row,
    )
  })
  const accruals = postable
    .filter((transaction) => transaction.recordType === 'accrual')
    .map((transaction) => ({
      id: `ACR-SF-${transaction.externalId}`,
      period: transaction.fiscalPeriod,
      wbs: transaction.wbs,
      description: transaction.description ?? `Snowflake accrual ${transaction.externalId}`,
      sourceType: 'manual' as const,
      sourceRef: transaction.externalId,
      basisAmountUsd: transaction.amount,
      settledAmountUsd: 0,
      accrualUsd: transaction.amount,
      status: 'reviewed' as const,
      calculationMethod: 'Approved Snowflake staged transaction',
      owner: transaction.vendor ?? actor,
      notes: `Source batch ${batchId}`,
    }))
  const postedAt = new Date().toISOString()
  return {
    ...state,
    costSheetRows: rows,
    costAccruals: [
      ...accruals.filter(
        (candidate) => !state.costAccruals.some((existing) => existing.id === candidate.id),
      ),
      ...state.costAccruals,
    ],
    costTransactions: state.costTransactions.map((transaction) =>
      postable.some((candidate) => candidate.id === transaction.id)
        ? { ...transaction, status: 'posted', postedAt, postedBy: actor }
        : transaction,
    ),
    costTransactionBatches: state.costTransactionBatches.map((entry) =>
      entry.id === batchId ? { ...entry, status: 'posted' } : entry,
    ),
  }
}
