import type { ProjectState } from '@pc/store/types.js'

export interface PortfolioPolicy {
  id: string
  name: string
  /** Minimum CPI before flagging project */
  cpiWarningThreshold: number
  /** Maximum open change exposure (USD) before PMO review */
  openChangeExposureLimitUsd: number
  /** Roles allowed to approve forecast at portfolio level */
  forecastSignoffRoles: string[]
}

export interface PortfolioRollup {
  portfolioId: string
  name: string
  projectCount: number
  totalBacUsd: number
  totalEacUsd: number
  totalActualsUsd: number
  weightedCpi: number
  weightedSpi: number
  flaggedProjects: Array<{ id: string; name: string; reason: string }>
}

export const defaultPortfolioPolicy: PortfolioPolicy = {
  id: 'default-oil-gas',
  name: 'O&G capital portfolio policy',
  cpiWarningThreshold: 0.92,
  openChangeExposureLimitUsd: 5_000_000,
  forecastSignoffRoles: ['approver', 'admin'],
}

export function rollupPortfolio(state: ProjectState, policy = defaultPortfolioPolicy): PortfolioRollup {
  const projects = state.portfolioProjects
  const flaggedProjects: PortfolioRollup['flaggedProjects'] = []

  projects.forEach((project) => {
    if (project.cpi < policy.cpiWarningThreshold) {
      flaggedProjects.push({
        id: project.id,
        name: project.name,
        reason: `CPI ${project.cpi.toFixed(2)} below threshold ${policy.cpiWarningThreshold}`,
      })
    }
    if (project.openChangesUsd > policy.openChangeExposureLimitUsd) {
      flaggedProjects.push({
        id: project.id,
        name: project.name,
        reason: `Open change exposure exceeds $${policy.openChangeExposureLimitUsd.toLocaleString()}`,
      })
    }
  })

  const totalBacUsd = projects.reduce((sum, project) => sum + project.bacUsd, 0)
  const totalEacUsd = projects.reduce((sum, project) => sum + project.eacUsd, 0)
  const totalActualsUsd = projects.reduce((sum, project) => sum + project.actualsUsd, 0)
  const weightedCpi =
    totalBacUsd === 0 ? 0 : projects.reduce((sum, project) => sum + project.cpi * project.bacUsd, 0) / totalBacUsd
  const weightedSpi =
    totalBacUsd === 0 ? 0 : projects.reduce((sum, project) => sum + project.spi * project.bacUsd, 0) / totalBacUsd

  return {
    portfolioId: 'active-portfolio',
    name: 'Active portfolio',
    projectCount: projects.length,
    totalBacUsd,
    totalEacUsd,
    totalActualsUsd,
    weightedCpi,
    weightedSpi,
    flaggedProjects,
  }
}
