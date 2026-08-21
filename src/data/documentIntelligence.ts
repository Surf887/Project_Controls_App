import type { ForecastDriver } from './forecastDrivers'

export type OcrProviderId = 'local' | 'azure' | 'aws'
export type DocumentStatus = 'uploaded' | 'extracting' | 'review_required' | 'accepted' | 'rejected' | 'failed'

export interface OcrPage {
  page: number
  text: string
  confidence: number
}

export interface OcrExtraction {
  provider: OcrProviderId
  model: string
  extractedAt: string
  pages: OcrPage[]
  fullText: string
  confidence: number
  warnings: string[]
}

export interface SourceDocument {
  id: string
  projectId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  provider: OcrProviderId
  status: DocumentStatus
  uploadedAt: string
  uploadedBy: string
  extraction?: OcrExtraction
  draftDrivers: ForecastDriver[]
  error?: string
}

export interface OcrProviderCapability {
  id: OcrProviderId
  label: string
  configured: boolean
  privacy: 'local' | 'cloud'
  supportedMimeTypes: string[]
}
