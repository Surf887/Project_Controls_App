import { randomUUID } from 'node:crypto'
import type { ForecastDriver } from '@pc/data/forecastDrivers.js'
import type { OcrExtraction, SourceDocument } from '@pc/data/documentIntelligence.js'
import type { ProjectState } from '@pc/store/types.js'

const controlTerms = /\b(eac|forecast|estimate|cost|claim|variation|change|exposure|risk|opportunity|saving|overrun|underrun|contingency)\b/i
const savingTerms = /\b(saving|reduction|credit|opportunity|avoidance|underrun)\b/i
const amountPattern = /(?:USD\s*|\$\s*)(\d[\d,]*(?:\.\d+)?)\s*(million|thousand|mn|m|k)?/gi

function amount(raw: string, suffix: string | undefined): number {
  const base = Number(raw.replace(/,/g, ''))
  const normalized = suffix?.toLowerCase()
  if (normalized === 'million' || normalized === 'mn' || normalized === 'm') return base * 1_000_000
  if (normalized === 'thousand' || normalized === 'k') return base * 1_000
  return base
}

function nearbyWbs(text: string, state: ProjectState): string[] {
  return state.costSheetRows
    .filter((row) => row.parentId === null && text.toLowerCase().includes(row.wbs.toLowerCase()))
    .map((row) => row.wbs)
}

function probability(text: string): number {
  const explicit = text.match(/\b(\d{1,3}(?:\.\d+)?)\s*%\s*(?:probability|likely|likelihood|chance)?/i)
  if (!explicit) return 0.5
  return Math.min(1, Math.max(0, Number(explicit[1]) / 100))
}

function titleFor(line: string): string {
  const cleaned = line.replace(/\s+/g, ' ').trim()
  return cleaned.length <= 120 ? cleaned : `${cleaned.slice(0, 117)}…`
}

export function extractDraftForecastDrivers(
  document: Pick<SourceDocument, 'id' | 'fileName' | 'uploadedAt' | 'uploadedBy'>,
  extraction: OcrExtraction,
  state: ProjectState,
): ForecastDriver[] {
  const drivers: ForecastDriver[] = []
  const seen = new Set<string>()

  extraction.pages.forEach((page) => {
    const lines = page.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    lines.forEach((line) => {
      if (drivers.length >= 100) return
      if (!controlTerms.test(line)) return
      for (const match of line.matchAll(amountPattern)) {
        const value = amount(match[1], match[2])
        if (!Number.isFinite(value) || value <= 0) continue
        const fingerprint = `${page.page}:${line}:${value}`
        if (seen.has(fingerprint)) continue
        seen.add(fingerprint)
        const direction = savingTerms.test(line) ? 'saving' : 'cost'
        const confidence = Math.min(0.99, Math.max(0.1, page.confidence * 0.9))
        drivers.push({
          id: `DRV-DOC-${randomUUID()}`,
          title: titleFor(line),
          sourceType: 'document',
          sourceEntityId: document.id,
          linkedEntityIds: [],
          wbs: nearbyWbs(line, state),
          impactDirection: direction,
          lowUsd: value * 0.8,
          mostLikelyUsd: value,
          highUsd: value * 1.2,
          probability: probability(line),
          scheduleImpactDays: 0,
          treatment: 'expected_value',
          status: 'draft',
          confidence,
          rationale: 'Draft extracted from document context; reviewer must confirm range, probability, WBS, and treatment.',
          evidence: {
            documentId: document.id,
            fileName: document.fileName,
            page: page.page,
            excerpt: line.slice(0, 2_000),
          },
          createdAt: document.uploadedAt,
          createdBy: document.uploadedBy,
        })
        if (drivers.length >= 100) return
      }
    })
  })
  return drivers
}
