import { Link, useLocation } from 'react-router-dom'
import { monthlyClosePath, pathForView } from '../routes/viewPaths'

const mobileTabs = [
  { label: 'Close', path: monthlyClosePath, testId: 'mobile-nav-close' },
  { label: 'Cost', path: pathForView('costsheet'), testId: 'mobile-nav-cost' },
  { label: 'Changes', path: pathForView('changes'), testId: 'mobile-nav-changes' },
  { label: 'Forecast', path: pathForView('forecast-engine'), testId: 'mobile-nav-forecast' },
  { label: 'More', path: pathForView('dashboard'), testId: 'mobile-nav-more' },
] as const

export function MobileNav() {
  const location = useLocation()

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation" data-testid="mobile-nav">
      {mobileTabs.map((tab) => {
        const active = location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`)
        return (
          <Link
            key={tab.path}
            className={active ? 'mobile-nav-item active' : 'mobile-nav-item'}
            to={tab.path}
            data-testid={tab.testId}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
