import { describe, expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbook, inferHeaderRow, prepareDataset, parseProjectList, parseRanges, MAX_FILE_BYTES } from '../src/lib/parse'
import { analyzeRows } from '../src/lib/analysis'
import { freshDefaultRules } from '../src/lib/default-rules'

const matrix = [['Company', 'Invoice No'], ['Division 2026 [5200]', 'I-01'], ['', 'I-02'], ['', ''], ['Company [5791]', 'I-03']]
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

describe('input formats', () => {
  for (const type of ['xls', 'xlsx'] as const) test(`reads real ${type} files`, () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), 'Invoices')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: type }) as ArrayBuffer
    const parsed = parseWorkbook(buffer, `synthetic.${type}`)
    const data = prepareDataset(parsed.sheets[0])
    expect(data.headers).toEqual(matrix[0])
    expect(data.companyColumn).toBe(0)
    expect(data.rows.map(row => row.sourceRow)).toEqual([2, 3, 5])
    expect(data.skippedBlankRows).toBe(1)
    const result = analyzeRows(data.rows, data.companyColumn, freshDefaultRules())
    expect(result.totalInvoices).toBe(3)
    expect(result.unknownInvoices).toBe(1)
  })
  test('CSV supports quotes, embedded line breaks, commas, Chinese, and BOM', () => {
    const parsed = parseWorkbook(bytes('\uFEFFCompany,Invoice No,Notes\r\n"公司 [5200]",01,"line 1\nline 2"\r\nCompany [5791],02,"a,b"\r\n'), 'sample.csv')
    const data = prepareDataset(parsed.sheets[0])
    expect(data.companyColumn).toBe(0)
    expect(data.rows[0].values).toEqual(['公司 [5200]', '01', 'line 1\nline 2'])
    expect(data.rows[1].values[2]).toBe('a,b')
  })
  test('supports a title row, multiple sheets, duplicate labels, and manual header selection', () => {
    const sheet = { name: 'Sheet', rows: [['AP report'], ['Company', 'Note', 'Note'], ['Project [5006]', 'A', 'B']] }
    expect(inferHeaderRow(sheet)).toBe(1)
    expect(prepareDataset(sheet).headers).toEqual(['Company', 'Note', 'Note (2)'])
    expect(prepareDataset({ name: 'manual', rows: [['Project', 'Invoice'], ['5006', 'I']] }, 0).companyColumn).toBe(-1)
  })
  test('rejects empty/wrong/oversized input rather than inventing results', () => {
    expect(() => parseWorkbook(bytes(''), 'empty.csv')).toThrow('empty')
    expect(() => parseWorkbook(bytes('a,b'), 'file.pdf')).toThrow('.csv')
    expect(() => parseWorkbook(new ArrayBuffer(MAX_FILE_BYTES + 1), 'huge.csv')).toThrow('25 MB')
    expect(() => prepareDataset({ name: 'empty', rows: [] })).toThrow('header row')
  })
})

test('portfolio UI parsers validate complete tokens', () => {
  expect(parseProjectList('5200, 5260；5261\n5200')).toEqual([5200, 5260, 5261])
  expect(() => parseProjectList('5200,nope')).toThrow()
  expect(parseRanges('5006-5216, 5791+')).toEqual([{ start: 5006, end: 5216 }, { start: 5791, end: null }])
  expect(() => parseRanges('5216-5006')).toThrow()
})
