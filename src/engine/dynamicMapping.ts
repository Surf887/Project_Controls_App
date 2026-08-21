import type {
  MappingIssue,
  MappingProfile,
  MappingResult,
  MappingRule,
  MappingTargetDomain,
  MappingTransform,
} from '../data/mappingProfiles'

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface CanonicalField {
  field: string
  label: string
  required: boolean
  aliases: string[]
}

export const canonicalFields: Record<MappingTargetDomain, CanonicalField[]> = {
  contractor_report: [
    { field: 'field', label: 'Metric / field name', required: true, aliases: ['field', 'metric', 'name', 'description'] },
    { field: 'category', label: 'Category', required: true, aliases: ['category', 'type', 'data type'] },
    { field: 'rawValue', label: 'Raw value', required: true, aliases: ['raw value', 'value', 'amount', 'reported value'] },
    { field: 'normalizedValue', label: 'Normalized numeric value', required: false, aliases: ['normalized value', 'numeric value'] },
    { field: 'unit', label: 'Unit / currency', required: false, aliases: ['unit', 'currency', 'uom'] },
    { field: 'period', label: 'Reporting period', required: false, aliases: ['period', 'month', 'week', 'reporting period'] },
    { field: 'wbs', label: 'WBS', required: true, aliases: ['wbs', 'work breakdown structure', 'work package'] },
    { field: 'cbs', label: 'CBS / cost code', required: true, aliases: ['cbs', 'cost code', 'cost account'] },
    { field: 'owner', label: 'Owner', required: false, aliases: ['owner', 'discipline', 'function'] },
    { field: 'confidence', label: 'Confidence', required: false, aliases: ['confidence', 'score'] },
    { field: 'pbs', label: 'SCCS PBS', required: false, aliases: ['pbs'] },
    { field: 'sab', label: 'SCCS SAB', required: false, aliases: ['sab'] },
    { field: 'cor', label: 'SCCS COR', required: false, aliases: ['cor'] },
  ],
  cost_transaction: [
    { field: 'externalId', label: 'External line ID', required: true, aliases: ['id', 'line id', 'document line', 'transaction id'] },
    { field: 'projectCode', label: 'Project code', required: true, aliases: ['project', 'project code', 'project id'] },
    { field: 'wbs', label: 'WBS', required: true, aliases: ['wbs', 'wbs element', 'project wbs'] },
    { field: 'cbs', label: 'CBS / cost element', required: false, aliases: ['cbs', 'cost element', 'cost code', 'gl account'] },
    { field: 'recordType', label: 'Record type', required: true, aliases: ['record type', 'transaction type', 'value type'] },
    { field: 'postingDate', label: 'Posting date', required: true, aliases: ['posting date', 'document date', 'accounting date'] },
    { field: 'fiscalPeriod', label: 'Fiscal period', required: false, aliases: ['fiscal period', 'period', 'month'] },
    { field: 'amount', label: 'Amount', required: true, aliases: ['amount', 'value', 'amount usd', 'reporting amount'] },
    { field: 'currency', label: 'Currency', required: true, aliases: ['currency', 'currency code'] },
    { field: 'poNumber', label: 'PO number', required: false, aliases: ['po', 'po number', 'purchase order'] },
    { field: 'vendor', label: 'Vendor', required: false, aliases: ['vendor', 'supplier', 'vendor name'] },
    { field: 'description', label: 'Description', required: false, aliases: ['description', 'text', 'line text'] },
    { field: 'updatedAt', label: 'Source updated at', required: false, aliases: ['updated at', 'last updated', 'modified at'] },
  ],
  schedule_activity: [
    { field: 'activityId', label: 'Activity ID', required: true, aliases: ['activity id', 'task id', 'activity code'] },
    { field: 'activityName', label: 'Activity name', required: true, aliases: ['activity name', 'task name', 'name'] },
    { field: 'wbs', label: 'WBS', required: true, aliases: ['wbs', 'wbs code'] },
    { field: 'baselineStart', label: 'Baseline start', required: true, aliases: ['baseline start', 'bl start'] },
    { field: 'baselineFinish', label: 'Baseline finish', required: true, aliases: ['baseline finish', 'bl finish'] },
    { field: 'currentStart', label: 'Current start', required: true, aliases: ['start', 'current start'] },
    { field: 'currentFinish', label: 'Current finish', required: true, aliases: ['finish', 'current finish'] },
    { field: 'percentComplete', label: 'Percent complete', required: true, aliases: ['percent complete', '% complete', 'progress'] },
    { field: 'totalFloat', label: 'Total float', required: false, aliases: ['total float', 'float'] },
  ],
}

export function schemaFingerprint(headers: string[]): string {
  const value = headers.map(normalizeHeader).sort().join('|')
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function sourceValue(row: Record<string, string>, column: string): string {
  return row[normalizeHeader(column)]?.trim() ?? ''
}

function transform(value: string, operation: MappingTransform): string {
  if (operation === 'trim') return value.trim()
  if (operation === 'uppercase') return value.toUpperCase()
  if (operation === 'lowercase') return value.toLowerCase()
  if (operation === 'number') {
    const parsed = Number(value.replace(/[$,%\s]/g, ''))
    return Number.isFinite(parsed) ? String(parsed) : ''
  }
  if (!value.trim()) return ''
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? '' : new Date(timestamp).toISOString().slice(0, 10)
}

function mapRule(rule: MappingRule, row: Record<string, string>): string {
  const values = rule.sourceColumns.map((column) => sourceValue(row, column))
  let value = ''
  if (rule.operation === 'constant') value = rule.constant ?? ''
  if (rule.operation === 'direct') value = values[0] ?? ''
  if (rule.operation === 'coalesce') value = values.find(Boolean) ?? ''
  if (rule.operation === 'concat') value = values.filter(Boolean).join(rule.delimiter ?? ' ')
  value = rule.transforms.reduce(transform, value)
  const mapped = Object.entries(rule.valueMap).find(
    ([source]) => source.trim().toLowerCase() === value.trim().toLowerCase(),
  )
  return (mapped?.[1] ?? value ?? rule.defaultValue ?? '').trim() || rule.defaultValue?.trim() || ''
}

export function applyMappingProfile(
  profile: MappingProfile,
  headers: string[],
  sourceRows: Record<string, string>[],
): MappingResult {
  const issues: MappingIssue[] = []
  const rows = sourceRows.map((source, index) => {
    const mapped: Record<string, string> = {}
    profile.rules.forEach((rule) => {
      const value = mapRule(rule, source)
      mapped[rule.targetField] = value
      if (rule.required && !value) {
        issues.push({
          row: index + 2,
          field: rule.targetField,
          severity: 'error',
          message: `Required ${rule.targetField} is empty after mapping.`,
        })
      }
    })
    return mapped
  })
  const currentFingerprint = schemaFingerprint(headers)
  const schemaChanged = Boolean(
    profile.schemaFingerprint && profile.schemaFingerprint !== currentFingerprint,
  )
  if (schemaChanged) {
    issues.unshift({
      row: 1,
      field: 'schema',
      severity: 'warning',
      message: 'Source columns changed since this mapping profile was saved.',
    })
  }
  return { rows, issues, schemaChanged, currentFingerprint }
}

export function suggestMappingRules(
  headers: string[],
  domain: MappingTargetDomain,
): MappingRule[] {
  return canonicalFields[domain].map((target, index) => {
    const aliases = new Set([target.field, ...target.aliases].map(normalizeHeader))
    const matched = headers.find((header) => aliases.has(normalizeHeader(header)))
    return {
      id: `MAP-RULE-${index + 1}`,
      targetField: target.field,
      sourceColumns: matched ? [matched] : [],
      operation: 'direct',
      transforms: ['trim'],
      valueMap: {},
      required: target.required,
    }
  })
}
