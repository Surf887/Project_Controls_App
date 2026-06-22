import PDFDocument from 'pdfkit'
import type { ProjectState } from '@pc/store/types.js'
import { sumBac, sumCostSheetMetric } from '@pc/engine/costAggregation.js'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function generateClosePackPdfAsync(state: ProjectState, generatedBy: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const bac = sumBac(state.costSheetRows)
    const actuals = sumCostSheetMetric(state.costSheetRows, 'actualsToDate')
    const eac = sumCostSheetMetric(state.costSheetRows, 'eac')

    doc.fontSize(18).text(`${state.meta.name} — Monthly Close Pack`)
    doc.moveDown()
    doc.fontSize(11).text(`Period: ${state.meta.baselineLabel}`)
    doc.text(`Generated: ${new Date().toLocaleString()} by ${generatedBy}`)
    doc.moveDown()
    doc.fontSize(13).text('Executive summary (control accounts)')
    doc.moveDown(0.5)
    doc.fontSize(11)
    doc.text(`BAC:     ${formatUsd(bac)}`)
    doc.text(`Actuals: ${formatUsd(actuals)}`)
    doc.text(`EAC:     ${formatUsd(eac)}`)
    doc.text(`VAC:     ${formatUsd(bac - eac)}`)
    doc.end()
  })
}
