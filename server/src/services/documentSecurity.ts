const signatures: Record<string, (content: Buffer) => boolean> = {
  'application/pdf': (content) => content.subarray(0, 5).toString('ascii') === '%PDF-',
  'image/png': (content) => content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': (content) => content[0] === 0xff && content[1] === 0xd8 && content.at(-2) === 0xff && content.at(-1) === 0xd9,
  'image/tiff': (content) => {
    const magic = content.subarray(0, 4).toString('hex')
    return magic === '49492a00' || magic === '4d4d002a'
  },
  'text/plain': (content) => !content.subarray(0, 1024).includes(0),
  'text/csv': (content) => !content.subarray(0, 1024).includes(0),
}

export function validateDocumentSignature(content: Buffer, mimeType: string): void {
  const validator = signatures[mimeType]
  if (!validator || !validator(content)) {
    throw new Error(`File content does not match supported MIME type ${mimeType}`)
  }
}

export async function scanDocument(content: Buffer, mimeType: string, fileName: string): Promise<void> {
  const endpoint = process.env.DOCUMENT_SCAN_ENDPOINT
  if (!endpoint) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DOCUMENT_SCAN_ENDPOINT is required for production document ingestion')
    }
    return
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      'X-File-Name': encodeURIComponent(fileName),
      Accept: 'application/json',
      ...(process.env.DOCUMENT_SCAN_TOKEN ? { Authorization: `Bearer ${process.env.DOCUMENT_SCAN_TOKEN}` } : {}),
    },
    body: new Uint8Array(content),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Document malware scan failed (${response.status})`)
  const result = (await response.json()) as { clean?: boolean; threat?: string }
  if (result.clean !== true) throw new Error(`Document rejected by malware scan${result.threat ? `: ${result.threat}` : ''}`)
}
