import { createWorker } from 'tesseract.js'
import { extractText as extractPdfText } from 'unpdf'
import {
  DetectDocumentTextCommand,
  TextractClient,
  type Block,
} from '@aws-sdk/client-textract'
import type {
  OcrExtraction,
  OcrPage,
  OcrProviderCapability,
  OcrProviderId,
} from '@pc/data/documentIntelligence.js'

const supported = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'text/plain', 'text/csv']

function aggregate(provider: OcrProviderId, model: string, pages: OcrPage[], warnings: string[] = []): OcrExtraction {
  const confidence =
    pages.length === 0 ? 0 : pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length
  return {
    provider,
    model,
    extractedAt: new Date().toISOString(),
    pages,
    fullText: pages.map((page) => page.text).join('\n\n'),
    confidence,
    warnings,
  }
}

export function ocrProviderCapabilities(): OcrProviderCapability[] {
  return [
    {
      id: 'local',
      label: 'Privacy-first local processing',
      configured: true,
      privacy: 'local',
      supportedMimeTypes: supported,
    },
    {
      id: 'azure',
      label: 'Azure AI Document Intelligence',
      configured: Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY),
      privacy: 'cloud',
      supportedMimeTypes: supported.slice(0, 4),
    },
    {
      id: 'aws',
      label: 'AWS Textract',
      configured: Boolean(process.env.AWS_REGION),
      privacy: 'cloud',
      supportedMimeTypes: ['image/png', 'image/jpeg'],
    },
  ]
}

async function localEndpointExtraction(content: Buffer, mimeType: string): Promise<OcrExtraction> {
  const endpoint = process.env.OCR_LOCAL_ENDPOINT
  if (!endpoint) {
    throw new Error('Scanned document requires OCR_LOCAL_ENDPOINT or local Tesseract language data')
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      Accept: 'application/json',
      ...(process.env.OCR_LOCAL_TOKEN ? { Authorization: `Bearer ${process.env.OCR_LOCAL_TOKEN}` } : {}),
    },
    body: new Uint8Array(content),
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`Local OCR service failed (${response.status})`)
  const result = (await response.json()) as { pages?: Array<{ page?: number; text?: string; confidence?: number }>; model?: string }
  const pages = (result.pages ?? []).map((page, index) => ({
    page: page.page ?? index + 1,
    text: page.text ?? '',
    confidence: Math.min(1, Math.max(0, page.confidence ?? 0.75)),
  }))
  if (pages.length === 0) throw new Error('Local OCR service returned no pages')
  return aggregate('local', result.model ?? 'local-ocr-service', pages)
}

async function extractLocal(content: Buffer, mimeType: string): Promise<OcrExtraction> {
  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    return aggregate('local', 'built-in-text', [{ page: 1, text: content.toString('utf8'), confidence: 1 }])
  }
  if (mimeType === 'application/pdf') {
    const result = await extractPdfText(new Uint8Array(content), { mergePages: false })
    const pages = (result.text as string[]).map((text, index) => ({
      page: index + 1,
      text,
      confidence: text.trim() ? 0.99 : 0,
    }))
    if (pages.some((page) => page.text.trim().length > 20)) {
      return aggregate('local', 'unpdf-text-layer', pages, pages.some((page) => !page.text.trim()) ? ['Some PDF pages contain no text layer.'] : [])
    }
    return localEndpointExtraction(content, mimeType)
  }
  const tessdata = process.env.OCR_LOCAL_TESSDATA_PATH
  if (!tessdata) return localEndpointExtraction(content, mimeType)
  const worker = await createWorker(process.env.OCR_LOCAL_LANGUAGE ?? 'eng', 1, {
    langPath: tessdata,
    cacheMethod: 'none',
    logger: () => undefined,
  })
  try {
    const result = await worker.recognize(content)
    return aggregate('local', 'tesseract-local', [
      {
        page: 1,
        text: result.data.text,
        confidence: Math.min(1, Math.max(0, result.data.confidence / 100)),
      },
    ])
  } finally {
    await worker.terminate()
  }
}

async function extractAzure(content: Buffer, mimeType: string): Promise<OcrExtraction> {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.replace(/\/+$/, '')
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  if (!endpoint || !key) throw new Error('Azure Document Intelligence is not configured')
  const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? '2024-11-30'
  const submitted = await fetch(
    `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=${encodeURIComponent(apiVersion)}`,
    {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': mimeType },
      body: new Uint8Array(content),
      signal: AbortSignal.timeout(60_000),
    },
  )
  if (submitted.status !== 202) throw new Error(`Azure document submission failed (${submitted.status})`)
  const operation = submitted.headers.get('operation-location')
  if (!operation) throw new Error('Azure response omitted operation-location')
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    const response = await fetch(operation, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Azure analysis poll failed (${response.status})`)
    const result = (await response.json()) as {
      status?: string
      analyzeResult?: { pages?: Array<{ pageNumber?: number; lines?: Array<{ content?: string }> }> }
      error?: { message?: string }
    }
    if (result.status === 'failed') throw new Error(result.error?.message ?? 'Azure document analysis failed')
    if (result.status === 'succeeded') {
      const pages = (result.analyzeResult?.pages ?? []).map((page, index) => ({
        page: page.pageNumber ?? index + 1,
        text: (page.lines ?? []).map((line) => line.content ?? '').join('\n'),
        confidence: 0.9,
      }))
      return aggregate('azure', 'prebuilt-layout', pages)
    }
  }
  throw new Error('Azure document analysis timed out')
}

function awsPageText(blocks: Block[]): OcrPage[] {
  const byPage = new Map<number, Array<{ text: string; confidence: number }>>()
  blocks
    .filter((block) => block.BlockType === 'LINE' && block.Text)
    .forEach((block) => {
      const page = block.Page ?? 1
      const values = byPage.get(page) ?? []
      values.push({ text: block.Text!, confidence: (block.Confidence ?? 0) / 100 })
      byPage.set(page, values)
    })
  return [...byPage.entries()].map(([page, lines]) => ({
    page,
    text: lines.map((line) => line.text).join('\n'),
    confidence: lines.length === 0 ? 0 : lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length,
  }))
}

async function extractAws(content: Buffer, mimeType: string): Promise<OcrExtraction> {
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
    throw new Error('AWS synchronous Textract provider currently supports PNG/JPEG; use local or Azure for PDF/TIFF')
  }
  const client = new TextractClient({ region: process.env.AWS_REGION })
  try {
    const result = await client.send(new DetectDocumentTextCommand({ Document: { Bytes: content } }))
    return aggregate('aws', 'detect-document-text', awsPageText(result.Blocks ?? []))
  } finally {
    client.destroy()
  }
}

export async function extractDocument(
  provider: OcrProviderId,
  content: Buffer,
  mimeType: string,
): Promise<OcrExtraction> {
  if (!supported.includes(mimeType)) throw new Error(`Unsupported document type: ${mimeType}`)
  if (provider === 'local') return extractLocal(content, mimeType)
  if (provider === 'azure') return extractAzure(content, mimeType)
  return extractAws(content, mimeType)
}
