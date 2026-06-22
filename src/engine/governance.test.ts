import { describe, expect, it } from 'vitest'
import { changeRegister } from '../data/registers'
import { teamReportTemplates } from '../data/governance'
import { createSeedState } from '../store/seedState'
import {
  approveForecastPackage,
  buildDraftForecastPackage,
  createChangeRequest,
  decideChange,
  generateTeamReportCsv,
  submitChangeForApproval,
  submitForecastPackage,
  syncActivePortfolioProject,
} from './governance'

describe('governance workflows', () => {
  const state = createSeedState()

  it('creates and submits a change request with approval history', () => {
    const change = createChangeRequest(
      {
        title: 'Additional cable tray',
        phase: 'Construction',
        type: 'Scope',
        mechanism: 'scope_change',
        costClass: 'CapEx',
        description: 'Extra cable tray in Area A',
        raisedBy: 'Construction',
        costImpactUsd: 120000,
        scheduleImpactDays: 5,
        probability: 0.7,
        affectedWbs: ['A.01'],
        rationale: 'Field routing conflict',
        approver: 'Project Director',
        contractor: 'Gulf Modular Contractors',
      },
      'You',
    )

    expect(change.status).toBe('draft')
    expect(change.approvalHistory).toHaveLength(1)

    const submitted = submitChangeForApproval(change, 'You', 'Change control', 'Ready for review')
    expect(submitted.status).toBe('submitted')
    expect(submitted.approvalHistory?.at(-1)?.action).toBe('submitted')
  })

  it('records approve/reject decisions on changes', () => {
    const draft = createChangeRequest(
      {
        title: 'Test CO',
        phase: 'Construction',
        type: 'Scope',
        mechanism: 'scope_change',
        costClass: 'CapEx',
        description: 'Test',
        raisedBy: 'PM',
        costImpactUsd: 50000,
        scheduleImpactDays: 0,
        probability: 1,
        affectedWbs: ['A.01'],
        rationale: 'Test',
        approver: 'Project Director',
        contractor: 'Gulf Modular Contractors',
      },
      'You',
    )
    const submitted = submitChangeForApproval(draft, 'You', 'Change control')
    const approved = decideChange(submitted, 'approved', 'Project Director', 'Approver', 'Approved')
    expect(approved.status).toBe('approved')
    expect(approved.approvalHistory?.at(-1)?.action).toBe('approved')
  })

  it('builds and approves forecast packages', () => {
    const draft = buildDraftForecastPackage(state)
    expect(draft.status).toBe('draft')
    expect(draft.eacTotalUsd).toBeGreaterThan(0)

    const submitted = submitForecastPackage(draft, 'Cost Engineer')
    expect(submitted.status).toBe('under_review')

    const approved = approveForecastPackage(submitted, 'Project Director')
    expect(approved.status).toBe('approved')
    expect(approved.approvalHistory.at(-1)?.action).toBe('forecast_approved')
  })

  it('syncs active portfolio project from live state', () => {
    const projects = syncActivePortfolioProject(state)
    const active = projects.find((p) => p.isActive)
    expect(active).toBeDefined()
    expect(active!.bacUsd).toBeGreaterThan(0)
    expect(projects.length).toBeGreaterThan(1)
  })

  it('generates team report CSV content', () => {
    const template = teamReportTemplates.find((t) => t.template === 'change_pipeline')!
    const report = generateTeamReportCsv(template, { ...state, changes: changeRegister }, 'You')
    expect(report.rowCount).toBeGreaterThan(0)
    expect(report.content).toContain('ID')
    expect(report.content.split('\n').length).toBeGreaterThan(report.preview.split('\n').length - 1)
  })
})
