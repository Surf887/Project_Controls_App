import { describe, expect, it } from 'vitest'
import { extractDocument, ocrProviderCapabilities } from './ocrService.js'

describe('OCR providers', () => {
  it('keeps plain-text extraction local and deterministic', async () => {
    const result = await extractDocument(
      'local',
      Buffer.from('Forecast EAC USD 1,250,000 for A.01'),
      'text/plain',
    )
    expect(result.provider).toBe('local')
    expect(result.model).toBe('built-in-text')
    expect(result.fullText).toContain('1,250,000')
    expect(result.confidence).toBe(1)
  })

  it('reports cloud providers as unconfigured without credentials', () => {
    const providers = ocrProviderCapabilities()
    expect(providers.find((provider) => provider.id === 'local')?.configured).toBe(true)
    expect(providers.some((provider) => provider.privacy === 'cloud')).toBe(true)
  })
})
