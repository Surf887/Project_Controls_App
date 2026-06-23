import type { SccsCodeEntry } from '../sccs'

/** ISO 19008 Annex B — Standard Activity Breakdown. */
export const sabCodes: SccsCodeEntry[] = [
  { facet: 'sab', code: 'J', level: 1, parentCode: null, name: 'Business development', description: 'Early-phase business and concept studies' },
  { facet: 'sab', code: 'JA', level: 2, parentCode: 'J', name: 'Concept and feasibility', description: 'Concept select, feasibility studies' },
  { facet: 'sab', code: 'K', level: 1, parentCode: null, name: 'Project execution', description: 'Capital project execution activities' },
  { facet: 'sab', code: 'KA', level: 2, parentCode: 'K', name: 'Exploration', description: 'Exploration drilling and appraisal' },
  { facet: 'sab', code: 'KB', level: 2, parentCode: 'K', name: 'Development planning', description: 'Field development planning and FEED' },
  { facet: 'sab', code: 'KE', level: 2, parentCode: 'K', name: 'Engineering', description: 'Design, studies, technical assurance' },
  { facet: 'sab', code: 'KEA', level: 3, parentCode: 'KE', name: 'Concept / FEED engineering', description: 'Front-end and detailed design' },
  { facet: 'sab', code: 'KEB', level: 3, parentCode: 'KE', name: 'Detailed engineering', description: 'Detailed design and IFC deliverables' },
  { facet: 'sab', code: 'KC', level: 2, parentCode: 'K', name: 'Procurement', description: 'Material and equipment procurement' },
  { facet: 'sab', code: 'KCA', level: 3, parentCode: 'KC', name: 'Equipment procurement', description: 'Major equipment and packages' },
  { facet: 'sab', code: 'KCB', level: 3, parentCode: 'KC', name: 'Bulk / materials procurement', description: 'Bulk materials and commodities' },
  { facet: 'sab', code: 'KD', level: 2, parentCode: 'K', name: 'Construction', description: 'Fabrication, installation, construction' },
  { facet: 'sab', code: 'KDA', level: 3, parentCode: 'KD', name: 'Fabrication', description: 'Shop fabrication and assembly' },
  { facet: 'sab', code: 'KDB', level: 3, parentCode: 'KD', name: 'Installation', description: 'Site and offshore installation' },
  { facet: 'sab', code: 'KF', level: 2, parentCode: 'K', name: 'Commissioning and startup', description: 'Pre-commissioning through startup' },
  { facet: 'sab', code: 'KH', level: 2, parentCode: 'K', name: 'Project management', description: 'Controls, planning, admin, closeout' },
  { facet: 'sab', code: 'KR', level: 2, parentCode: 'K', name: 'Removal and decommissioning', description: 'Decommissioning and abandonment' },
  { facet: 'sab', code: 'L', level: 1, parentCode: null, name: 'Operations', description: 'Operations and maintenance phase' },
  { facet: 'sab', code: 'LA', level: 2, parentCode: 'L', name: 'Operations', description: 'Steady-state operations' },
  { facet: 'sab', code: 'LB', level: 2, parentCode: 'L', name: 'Maintenance', description: 'Planned and corrective maintenance' },
]
