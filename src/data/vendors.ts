import type { SupportedCurrency } from '../store/types'

export type VendorType = 'EPC' | 'Subcontractor' | 'Supplier' | 'Service'

export interface Vendor {
  id: string
  code: string
  name: string
  type: VendorType
  country: string
  currency: SupportedCurrency
  contact: string
  activeContracts: number
  status: 'active' | 'inactive' | 'watch'
}

export const vendorMaster: Vendor[] = [
  {
    id: 'V-001',
    code: 'DELTA-EQ',
    name: 'Delta Equipment JV',
    type: 'Supplier',
    country: 'Germany',
    currency: 'EUR',
    contact: 'commercial@delta-equipment.example',
    activeContracts: 2,
    status: 'active',
  },
  {
    id: 'V-002',
    code: 'GULF-MC',
    name: 'Gulf Modular Contractors',
    type: 'Subcontractor',
    country: 'UAE',
    currency: 'AED',
    contact: 'contracts@gulf-modular.example',
    activeContracts: 1,
    status: 'active',
  },
  {
    id: 'V-003',
    code: 'NORTHFIELD',
    name: 'Northfield Construction',
    type: 'Subcontractor',
    country: 'USA',
    currency: 'USD',
    contact: 'pm@northfield.example',
    activeContracts: 1,
    status: 'active',
  },
  {
    id: 'V-004',
    code: 'HELLENIC',
    name: 'Hellenic Pressure Works',
    type: 'Supplier',
    country: 'Greece',
    currency: 'EUR',
    contact: 'expediting@hellenic.example',
    activeContracts: 1,
    status: 'watch',
  },
  {
    id: 'V-005',
    code: 'YOKOGAWA',
    name: 'Yokogawa Systems',
    type: 'Supplier',
    country: 'Singapore',
    currency: 'SGD',
    contact: 'sales@yokogawa.example',
    activeContracts: 1,
    status: 'active',
  },
]
