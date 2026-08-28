import type { NavView } from '../data/navigationModel'

/** Simulated/illustrative modules are excluded from production unless explicitly enabled. */
export const simulatedFeaturesEnabled = import.meta.env.VITE_ENABLE_SIMULATED_FEATURES === 'true'

const simulatedViews = new Set<NavView>([
  'integrations',
  'engineering',
  'model',
  'reality',
  'decisions',
])

export function isSimulatedView(view: NavView): boolean {
  return simulatedViews.has(view)
}

export function isViewEnabled(view: NavView): boolean {
  return simulatedFeaturesEnabled || !isSimulatedView(view)
}
