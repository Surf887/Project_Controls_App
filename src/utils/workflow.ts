import type { ExtractedValue, ReportDocument, ValidationIssue } from '../data/projectData'
import { buildSccsAssignment } from '../data/sccsMappings'
import type { SccsAssignment } from '../data/sccs'

export interface StoredAppState {
  reports: ReportDocument[]
  values: ExtractedValue[]
  selectedValueId: string
}

export const storageKey = 'project-controls-intelligence-state-v1'

export function loadStoredState(fallback: StoredAppState): StoredAppState {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(storageKey)

    if (!raw) {
      return fallback
    }

    const parsed = JSON.parse(raw) as StoredAppState

    if (!Array.isArray(parsed.reports) || !Array.isArray(parsed.values)) {
      return fallback
    }

    return parsed
  } catch {
    return fallback
  }
}

export function saveStoredState(state: StoredAppState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(storageKey, JSON.stringify(state))
}

export function clearStoredState() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(storageKey)
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    return []
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader)

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    const row: Record<string, string> = {}

    headers.forEach((header, index) => {
      row[header] = cells[index]?.trim() ?? ''
    })

    return row
  })
}

export function buildCsvImport(fileName: string, text: string, existingReportCount: number) {
  const rows = parseCsv(text).filter((row) => Object.values(row).some((value) => value.trim().length > 0))
  const importId = `rpt-csv-${Date.now()}`

  if (rows.length === 0) {
    return {
      error: 'CSV import needs a header row and at least one data row.',
      report: null,
      values: [],
    }
  }

  const values: ExtractedValue[] = rows.map((row, index) => {
    const field = readCell(row, ['field', 'metric', 'name', 'description']) || `Imported Metric ${index + 1}`
    const rawValue = readCell(row, ['rawvalue', 'raw', 'reportedvalue', 'value', 'amount']) || '0'
    const normalizedValue = parseNumericValue(readCell(row, ['normalizedvalue', 'normalized', 'numericvalue']) || rawValue)
    const unit = readCell(row, ['unit', 'currency', 'uom']) || inferUnit(rawValue, field)
    const confidence = clampConfidence(readCell(row, ['confidence', 'confidencescore', 'score']))
    const category = inferCategory(readCell(row, ['category', 'type']) || field)
    const wbs = readCell(row, ['wbs', 'workbreakdownstructure', 'workpackage']) || 'UNMAPPED-WBS'
    const cbs = readCell(row, ['cbs', 'costcode', 'costaccount']) || 'UNMAPPED-CBS'
    const pbsOverride = readCell(row, ['pbs'])
    const sabOverride = readCell(row, ['sab'])
    const corOverride = readCell(row, ['cor'])
    const issues = generateValidationIssues({ field, unit, confidence, normalizedValue, wbs, cbs })

    let sccs: SccsAssignment | undefined
    if (pbsOverride || sabOverride || corOverride) {
      sccs = buildSccsAssignment({
        wbs,
        cbs,
        category,
        manual: {
          pbs: pbsOverride || undefined,
          sab: sabOverride || undefined,
          cor: corOverride || undefined,
        },
        source: 'import',
      })
    } else {
      sccs = buildSccsAssignment({ wbs, cbs, category, source: 'mapped' })
    }

    return {
      id: `${importId}-val-${index + 1}`,
      reportId: importId,
      field,
      category,
      rawValue,
      normalizedValue,
      unit,
      period: readCell(row, ['period', 'reportingperiod', 'week', 'month']) || 'Imported period',
      wbs,
      cbs,
      sccs,
      standardMapping:
        readCell(row, ['standardmapping', 'mapping', 'standard', 'reference']) || 'Client-specific mapping pending',
      confidence,
      reviewStatus: issues.some((issue) => issue.severity === 'critical') ? 'needs_correction' : 'pending_review',
      approvalStatus: issues.some((issue) => issue.severity === 'critical') ? 'rejected' : 'unapproved',
      reviewer: 'Unassigned',
      owner: readCell(row, ['owner', 'discipline', 'function']) || inferOwner(category),
      source: {
        document: fileName,
        sheet: 'CSV import',
        table: 'Uploaded contractor report',
        row: String(index + 2),
        column: field,
        anchor: `CSV row ${index + 2}: ${field}`,
      },
      validationIssues: issues,
      correctionHistory: [],
    }
  })

  const issueCount = values.reduce((total, value) => total + value.validationIssues.length, 0)
  const averageConfidence = values.reduce((total, value) => total + value.confidence, 0) / values.length
  const firstRow = rows[0]

  const report: ReportDocument = {
    id: importId,
    name: fileName,
    contractor: readCell(firstRow, ['contractor', 'vendor', 'supplier']) || `Imported Contractor ${existingReportCount + 1}`,
    packageName: readCell(firstRow, ['package', 'packagename', 'workpackage', 'area']) || 'Imported work package',
    period: readCell(firstRow, ['period', 'reportingperiod', 'week', 'month']) || 'Imported period',
    sourceType: 'excel',
    receivedAt: new Date().toLocaleString(),
    status: 'reviewing',
    confidence: averageConfidence,
    extractedCount: values.length,
    issueCount,
    sourceSystem: 'Local CSV upload',
  }

  return {
    error: null,
    report,
    values,
  }
}

export function approvalBlockReason(value: ExtractedValue): string | null {
  if (value.wbs.trim().length === 0 || value.cbs.trim().length === 0 || /UNMAPPED/i.test(`${value.wbs} ${value.cbs}`)) {
    return 'Map this value to a valid WBS and CBS before approval.'
  }
  if (value.validationIssues.some((issue) => issue.severity === 'critical')) {
    return 'Resolve critical validation issues before approval.'
  }
  return null
}

export function canApproveValue(value: ExtractedValue) {
  return approvalBlockReason(value) === null
}

export function sampleCsvContent() {
  return [
    'contractor,package,period,field,category,rawValue,normalizedValue,unit,wbs,cbs,standardMapping,confidence,owner',
    'Pilot Contractor,Site Infrastructure,2026-W24,Current Forecast EAC,forecast,USD 128.4M,128400000,USD,SI.01.02,C-3100,AACE TCM cost account mapping,0.91,Cost Control',
    'Pilot Contractor,Site Infrastructure,2026-W24,Physical Progress,progress,44.2%,44.2,%,SI.01.02,N/A,Owner WBS progress account,0.84,Progress Measurement',
    'Pilot Contractor,Site Infrastructure,2026-W24,Pending Change Orders,change,USD 7.8M,7800000,USD,SI.02.00,C-9000,Change control log,0.76,Change Management',
    'Pilot Contractor,Site Infrastructure,2026-W24,Late Purchase Orders,procurement,6,6,count,P.04.01,N/A,Procurement expediting KPI,0.68,Procurement Controls',
  ].join('\n')
}

function splitCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)

  return cells
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function readCell(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)]

    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }

  return ''
}

function parseNumericValue(value: string) {
  const hasMillion = /\bm\b|million/i.test(value)
  const hasBillion = /\bb\b|billion/i.test(value)
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const parsed = Number(cleaned)

  if (Number.isNaN(parsed)) {
    return 0
  }

  if (hasBillion) {
    return parsed * 1_000_000_000
  }

  if (hasMillion) {
    return parsed * 1_000_000
  }

  return parsed
}

function clampConfidence(value: string) {
  const parsed = Number(value)

  if (Number.isNaN(parsed)) {
    return 0.72
  }

  const normalized = parsed > 1 ? parsed / 100 : parsed

  return Math.min(1, Math.max(0.1, normalized))
}

function inferUnit(rawValue: string, field: string) {
  const normalized = `${rawValue} ${field}`.toLowerCase()

  if (normalized.includes('usd') || normalized.includes('$') || normalized.includes('cost') || normalized.includes('forecast')) {
    return 'USD'
  }

  if (normalized.includes('%') || normalized.includes('progress')) {
    return '%'
  }

  return 'count'
}

function inferCategory(value: string): ExtractedValue['category'] {
  const normalized = value.toLowerCase()

  if (normalized.includes('progress') || normalized.includes('earned')) {
    return 'progress'
  }

  if (normalized.includes('change') || normalized.includes('claim')) {
    return 'change'
  }

  if (normalized.includes('procurement') || normalized.includes('purchase') || normalized.includes('po')) {
    return 'procurement'
  }

  if (normalized.includes('forecast') || normalized.includes('eac')) {
    return 'forecast'
  }

  return 'cost'
}

function inferOwner(category: ExtractedValue['category']) {
  switch (category) {
    case 'progress':
      return 'Progress Measurement'
    case 'change':
      return 'Change Management'
    case 'procurement':
      return 'Procurement Controls'
    case 'forecast':
      return 'Cost Control'
    default:
      return 'Cost Engineering'
  }
}

export function generateValidationIssues(input: {
  field: string
  unit: string
  confidence: number
  normalizedValue: number
  wbs: string
  cbs: string
}): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (input.wbs.includes('UNMAPPED') || input.cbs.includes('UNMAPPED')) {
    issues.push({
      severity: 'warning',
      message: 'Imported value needs WBS/CBS mapping review before approval.',
    })
  }

  if (input.confidence < 0.7) {
    issues.push({
      severity: 'warning',
      message: 'Low extraction confidence; reviewer should verify against the source row.',
    })
  }

  if (input.normalizedValue === 0) {
    issues.push({
      severity: 'critical',
      message: 'Normalized value is zero or unreadable; source row must be corrected before approval.',
    })
  }

  if (input.unit === '%' && input.normalizedValue > 100) {
    issues.push({
      severity: 'critical',
      message: 'Progress percentage cannot exceed 100%.',
    })
  }

  if (/late|delay|claim/i.test(input.field) && input.normalizedValue > 0) {
    issues.push({
      severity: 'warning',
      message: 'Risk indicator detected; require reviewer note before management reporting.',
    })
  }

  return issues
}
