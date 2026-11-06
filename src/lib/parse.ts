import * as XLSX from 'xlsx'
import type { ParsedWorkbook, ParsedSheet, PreparedDataset, ProjectRange } from './types'

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_ROWS = 250000
export const MAX_COLUMNS = 1000
const isBlank = (row: string[]) => row.every(value => value.trim() === '')
const normalizeHeader = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase()

/** Parse locally. Formula cells are read as displayed/cached values, never executed. */
export function parseWorkbook(buffer: ArrayBuffer, filename: string): ParsedWorkbook {
  if (!/\.(xls|xlsx|csv)$/i.test(filename)) throw new Error('Choose an .xls, .xlsx, or .csv file.')
  if (!buffer.byteLength) throw new Error('The file is empty.')
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error('The file exceeds the 25 MB browser processing limit.')
  const warnings: string[] = []
  const options: XLSX.ParsingOptions = { raw: true, cellDates: false, sheetRows: MAX_ROWS + 1, cellFormula: false }
  let workbook: XLSX.WorkBook
  if (/\.csv$/i.test(filename)) {
    // Match the supplied Python: UTF-8 decoding with replacement for invalid bytes.
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    if (text.includes('\uFFFD')) warnings.push('Some characters could not be decoded as UTF-8 and were replaced. Check the Company column before using the results.')
    workbook = XLSX.read(text, { ...options, type: 'string' })
  } else workbook = XLSX.read(buffer, { ...options, type: 'array' })
  if (!workbook.SheetNames.length) throw new Error('No worksheets were found.')
  if (workbook.SheetNames.length > 100) throw new Error('This workbook has more than 100 worksheets.')
  const sheets: ParsedSheet[] = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name]
    if (!sheet['!ref']) return { name, rows: [] }
    const range = XLSX.utils.decode_range((sheet['!fullref'] as string | undefined) ?? sheet['!ref'])
    if (range.e.r >= MAX_ROWS) throw new Error(`Worksheet "${name}" exceeds the ${MAX_ROWS.toLocaleString('en-US')} row limit. Split the file before importing.`)
    if (range.e.c >= MAX_COLUMNS) throw new Error(`Worksheet "${name}" exceeds the ${MAX_COLUMNS} column limit.`)
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
      range: { s: { r: 0, c: 0 }, e: range.e },
    })
    const rows = matrix.map(row => row.map(value => value === null || value === undefined ? '' : String(value)))
    while (rows.length && isBlank(rows[rows.length - 1])) rows.pop()
    return { name, rows }
  })
  if (!sheets.some(sheet => sheet.rows.some(row => !isBlank(row)))) throw new Error('The file contains no nonblank rows.')
  return { sheets, warnings }
}

/** Prefer a Company header so reports with a title or preamble work without editing. */
export function inferHeaderRow(sheet: ParsedSheet): number {
  const limit = Math.min(sheet.rows.length, 50)
  for (let index = 0; index < limit; index++) if (sheet.rows[index].some(value => normalizeHeader(value) === 'company')) return index
  return Math.max(0, sheet.rows.findIndex(row => !isBlank(row)))
}

export function prepareDataset(sheet: ParsedSheet, headerRow = inferHeaderRow(sheet)): PreparedDataset {
  if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= sheet.rows.length) throw new Error('Choose a header row that exists in the worksheet.')
  let width = sheet.rows[headerRow].length
  for (let index = headerRow + 1; index < sheet.rows.length; index++) width = Math.max(width, sheet.rows[index].length)
  const seen = new Map<string, number>()
  const headers = Array.from({ length: width }, (_, index) => {
    const base = sheet.rows[headerRow][index]?.replace(/^\uFEFF/, '').trim() || `Column ${index + 1}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count > 1 ? `${base} (${count})` : base
  })
  let skippedBlankRows = 0
  const rows = []
  for (let index = headerRow + 1; index < sheet.rows.length; index++) {
    const values = Array.from({ length: width }, (_, column) => sheet.rows[index][column] ?? '')
    if (isBlank(values)) { skippedBlankRows++; continue }
    rows.push({ sourceRow: index + 1, values })
  }
  return { headers, rows, companyColumn: headers.findIndex(header => normalizeHeader(header) === 'company'), skippedBlankRows }
}

/** UI text helpers reject malformed tokens instead of silently dropping projects. */
export function parseProjectList(text: string): number[] {
  if (!text.trim()) return []
  const parts = text.trim().split(/[\s,;，；]+/)
  const projects = parts.map(part => {
    if (!/^\d+$/.test(part)) throw new Error(`Invalid project ID: ${part}`)
    const value = Number(part)
    if (!Number.isSafeInteger(value)) throw new Error(`Project ID is too large: ${part}`)
    return value
  })
  return [...new Set(projects)]
}

export function parseRanges(text: string): ProjectRange[] {
  if (!text.trim()) return []
  return text.trim().split(/[,;，；\n]+/).map(part => {
    const value = part.trim()
    const match = value.match(/^(\d+)\s*(?:(?:-|–|—|\.\.)\s*(\d+)|(\+))?$/)
    if (!match) throw new Error(`Invalid range: ${value}. Use 5006-5216 or 5791+.`)
    const start = Number(match[1])
    const end = match[3] ? null : match[2] ? Number(match[2]) : start
    if (!Number.isSafeInteger(start) || (end !== null && (!Number.isSafeInteger(end) || end < start))) throw new Error(`Invalid range: ${value}`)
    return { start, end }
  })
}
