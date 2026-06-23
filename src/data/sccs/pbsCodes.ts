import type { SccsCodeEntry } from '../sccs'

/** ISO 19008 Annex A — Physical Breakdown Structure (representative full hierarchy). */
export const pbsCodes: SccsCodeEntry[] = [
  { facet: 'pbs', code: 'A', level: 1, parentCode: null, name: 'Offshore installations', description: 'Offshore production and processing facilities' },
  { facet: 'pbs', code: 'AA', level: 2, parentCode: 'A', name: 'Topsides', description: 'Above-water process and utility modules' },
  { facet: 'pbs', code: 'AAA', level: 3, parentCode: 'AA', name: 'Drilling area', description: 'Drilling and wellhead area topsides' },
  { facet: 'pbs', code: 'AAB', level: 3, parentCode: 'AA', name: 'Quarters and helideck', description: 'Living quarters, helideck, safety systems' },
  { facet: 'pbs', code: 'AAC', level: 3, parentCode: 'AA', name: 'Process and utilities', description: 'Process modules and utility systems' },
  { facet: 'pbs', code: 'AAD', level: 3, parentCode: 'AA', name: 'Utilities and offsites', description: 'Power, water, flare, export tie-ins' },
  { facet: 'pbs', code: 'AAE', level: 3, parentCode: 'AA', name: 'Export and offloading', description: 'Export pipelines, offloading systems' },
  { facet: 'pbs', code: 'AB', level: 2, parentCode: 'A', name: 'Substructures', description: 'Jackets, hulls, foundations, mooring' },
  { facet: 'pbs', code: 'ABA', level: 3, parentCode: 'AB', name: 'Jacket / hull', description: 'Primary substructure steel' },
  { facet: 'pbs', code: 'ABB', level: 3, parentCode: 'AB', name: 'Piles and foundations', description: 'Piling, suction anchors, grout' },
  { facet: 'pbs', code: 'AC', level: 2, parentCode: 'A', name: 'Offshore wells', description: 'Well construction and completion' },
  { facet: 'pbs', code: 'AD', level: 2, parentCode: 'A', name: 'Subsea system', description: 'Subsea production, umbilicals, risers' },
  { facet: 'pbs', code: 'ADA', level: 3, parentCode: 'AD', name: 'Subsea production system', description: 'Trees, manifolds, jumpers' },
  { facet: 'pbs', code: 'ADB', level: 3, parentCode: 'AD', name: 'Umbilicals and risers', description: 'Control umbilicals, flexibles, risers' },
  { facet: 'pbs', code: 'B', level: 1, parentCode: null, name: 'Onshore installations', description: 'Onshore plants and facilities' },
  { facet: 'pbs', code: 'BA', level: 2, parentCode: 'B', name: 'Process plant', description: 'Onshore process and utility plant' },
  { facet: 'pbs', code: 'BAA', level: 3, parentCode: 'BA', name: 'Process units', description: 'Process equipment areas and units' },
  { facet: 'pbs', code: 'BAB', level: 3, parentCode: 'BA', name: 'Tank farm', description: 'Storage tanks and bunds' },
  { facet: 'pbs', code: 'BB', level: 2, parentCode: 'B', name: 'Utilities plant', description: 'Power, steam, water treatment' },
  { facet: 'pbs', code: 'BC', level: 2, parentCode: 'B', name: 'Civil and structures', description: 'Earthworks, buildings, roads' },
  { facet: 'pbs', code: 'BCA', level: 3, parentCode: 'BC', name: 'Civil works', description: 'Foundations, piling, site prep' },
  { facet: 'pbs', code: 'BCB', level: 3, parentCode: 'BC', name: 'Buildings', description: 'Control rooms, workshops, warehouses' },
  { facet: 'pbs', code: 'BD', level: 2, parentCode: 'B', name: 'Pipeline and export', description: 'Onshore pipelines and export systems' },
]
