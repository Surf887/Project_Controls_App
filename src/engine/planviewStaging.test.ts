import { describe, expect, it } from 'vitest'
import type { MappingProfile } from '../data/mappingProfiles'
import { createSeedState } from '../store/seedState'
import { schemaFingerprint } from './dynamicMapping'
import { buildPlanviewBatch, postPlanviewBatch } from './planviewStaging'

function profile(): MappingProfile {
  const headers = ['SYS_ID', 'PROJECT_REF', 'ENTITY_KIND', 'ITEM_NAME', 'DETAILS', 'MANAGER_NAME', 'STATE_CODE', 'TARGET_DT', 'PCT_DONE', 'WORK_NODE', 'COST_DELTA', 'DELAY_DAYS']
  const mappings = [
    ['externalId', 'SYS_ID'], ['projectCode', 'PROJECT_REF'], ['itemType', 'ENTITY_KIND'],
    ['title', 'ITEM_NAME'], ['description', 'DETAILS'], ['owner', 'MANAGER_NAME'],
    ['status', 'STATE_CODE'], ['dueDate', 'TARGET_DT'], ['progressPercent', 'PCT_DONE'],
    ['wbs', 'WORK_NODE'], ['costImpactUsd', 'COST_DELTA'], ['scheduleImpactDays', 'DELAY_DAYS'],
  ] as const
  return {
    id: 'MAP-PV',
    name: 'Planview governance',
    organization: 'Owner',
    sourceType: 'api',
    targetDomain: 'project_governance',
    dataset: 'work-items',
    version: 1,
    status: 'active',
    schemaFingerprint: schemaFingerprint(headers),
    sourceHeaders: headers,
    rules: mappings.map(([target, source], index) => {
      const valueMap: Record<string, string> =
        target === 'itemType'
          ? { GATE: 'milestone', TASK: 'action', PROBLEM: 'issue', APPROVAL: 'decision' }
          : {}
      return {
        id: `R-${index}`,
        targetField: target,
        sourceColumns: [source],
        operation: 'direct',
        transforms: ['trim'],
        valueMap,
        required: ['externalId', 'projectCode', 'itemType', 'title', 'owner', 'status', 'dueDate'].includes(target),
      }
    }),
    createdAt: '2026-08-23T00:00:00.000Z',
    createdBy: 'Steward',
    updatedAt: '2026-08-23T00:00:00.000Z',
    updatedBy: 'Steward',
  }
}

describe('Planview governance staging', () => {
  it('maps arbitrary API fields into governed items', () => {
    const state = createSeedState()
    const result = buildPlanviewBatch(
      profile(),
      profile().sourceHeaders,
      [
        { sysid: 'M1', projectref: 'P1', entitykind: 'GATE', itemname: 'Mechanical completion', details: '', managername: 'Director', statecode: 'Active', targetdt: '2026-09-30', pctdone: '50', worknode: 'A.02', costdelta: '0', delaydays: '5' },
      ],
      [],
      state,
      'Steward',
      { now: '2026-08-23T00:00:00.000Z' },
    )
    expect(result.batch.status).toBe('staged')
    expect(result.items[0]).toMatchObject({
      itemType: 'milestone',
      wbs: 'A.02',
      progressPercent: 50,
      scheduleImpactDays: 5,
    })
  })

  it('posts approved milestones, actions, issues, and decisions idempotently', () => {
    const state = createSeedState()
    const rows = ['GATE', 'TASK', 'PROBLEM', 'APPROVAL'].map((kind, index) => ({
      sysid: `${index + 1}`,
      projectref: 'P1',
      entitykind: kind,
      itemname: `${kind} item`,
      details: 'Imported from Planview',
      managername: 'Owner',
      statecode: index === 0 ? 'Active' : 'Open',
      targetdt: '2026-09-30',
      pctdone: '25',
      worknode: 'A.01',
      costdelta: '100',
      delaydays: '2',
    }))
    const staged = buildPlanviewBatch(
      profile(),
      profile().sourceHeaders,
      rows,
      [],
      state,
      'Steward',
      { now: '2026-08-23T00:00:00.000Z' },
    )
    const approved = {
      ...state,
      planviewItems: staged.items.map((item) => ({ ...item, status: 'approved' as const })),
      planviewSyncBatches: [{ ...staged.batch, status: 'approved' as const }],
    }
    const posted = postPlanviewBatch(approved, staged.batch.id, 'Controller')
    expect(posted.scheduleActivities.some((activity) => activity.id === 'PLANVIEW:1')).toBe(true)
    expect(posted.actions.some((action) => action.id === 'PV-ACT-2')).toBe(true)
    expect(posted.issues.some((issue) => issue.id === 'PV-ISS-3')).toBe(true)
    expect(posted.decisions.some((decision) => decision.id === 'PV-DEC-4')).toBe(true)
    expect(postPlanviewBatch(posted, staged.batch.id, 'Controller')).toBe(posted)
  })
})
