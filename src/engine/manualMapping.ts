import type { ExtractedValue } from '../data/projectData'
import { findSccsCode, type SccsAssignment } from '../data/sccs'
import { buildSccsAssignment } from '../data/sccsMappings'
import { generateValidationIssues } from '../utils/workflow'
import { resetExtractionForCorrection } from './extractionIntegrity'

export interface ManualExtractionMapping {
  valueId: string
  targetWbs: string
  targetCbs: string
  manualSccs?: Pick<SccsAssignment, 'pbs' | 'sab' | 'cor'>
  applyToMatching: boolean
  actor: string
  at?: string
}

export interface ManualExtractionMappingResult {
  values: ExtractedValue[]
  updatedCount: number
}

/**
 * Apply a reviewed source-to-target mapping to one extraction or to rows from
 * the same report that currently share its source WBS/CBS pair.
 */
export function applyManualExtractionMapping(
  values: ExtractedValue[],
  mapping: ManualExtractionMapping,
): ManualExtractionMappingResult {
  const selected = values.find((value) => value.id === mapping.valueId)
  if (!selected) {
    return { values, updatedCount: 0 }
  }

  const targetWbs = mapping.targetWbs.trim()
  const targetCbs = mapping.targetCbs.trim()
  if (!targetWbs || !targetCbs || /UNMAPPED/i.test(`${targetWbs} ${targetCbs}`)) {
    return { values, updatedCount: 0 }
  }
  if (
    mapping.manualSccs &&
    (!findSccsCode('pbs', mapping.manualSccs.pbs) ||
      !findSccsCode('sab', mapping.manualSccs.sab) ||
      !findSccsCode('cor', mapping.manualSccs.cor))
  ) {
    return { values, updatedCount: 0 }
  }

  const shouldUpdate = (value: ExtractedValue) =>
    value.id === selected.id ||
    (mapping.applyToMatching &&
      value.reportId === selected.reportId &&
      value.wbs === selected.wbs &&
      value.cbs === selected.cbs)

  const updatedAt = mapping.at ?? new Date().toISOString()
  let updatedCount = 0

  const next = values.map((value) => {
    if (!shouldUpdate(value)) return value
    updatedCount += 1

    const sccs = buildSccsAssignment({
      wbs: targetWbs,
      cbs: targetCbs,
      category: value.category,
      manual: mapping.manualSccs,
      source: mapping.manualSccs ? 'manual' : 'mapped',
    })
    const reset = resetExtractionForCorrection(value)
    const fromSccs = value.sccs?.composite ?? 'automatic'

    return {
      ...reset,
      wbs: targetWbs,
      cbs: targetCbs,
      sccs,
      reviewer: mapping.actor,
      validationIssues: generateValidationIssues({
        field: value.field,
        unit: value.unit,
        confidence: value.confidence,
        normalizedValue: value.normalizedValue,
        wbs: targetWbs,
        cbs: targetCbs,
      }),
      correctionHistory: [
        {
          at: updatedAt,
          by: mapping.actor,
          from: `${value.wbs} / ${value.cbs} · ${fromSccs}`,
          to: `${targetWbs} / ${targetCbs} · ${sccs.composite}`,
          reason: mapping.applyToMatching
            ? 'Manual mapping applied to matching source rows.'
            : 'Manual mapping updated during review.',
        },
        ...value.correctionHistory,
      ],
    }
  })

  return { values: next, updatedCount }
}
