/** Local, read-only regression check. Real invoice files are never copied into the repo. */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import assert from 'node:assert/strict'
import { parseWorkbook, prepareDataset } from '../src/lib/parse'
import { analyzeRows } from '../src/lib/analysis'
import { freshDefaultRules } from '../src/lib/default-rules'

const paths = process.argv.slice(2)
if (!paths.length) throw new Error('Usage: npm run verify:attachments -- /path/to/ap.xls /path/to/ap.csv')
const results = paths.map(path => {
  const file = readFileSync(path)
  const workbook = parseWorkbook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, basename(path))
  const sheet = workbook.sheets.find(sheet => sheet.rows.length > 0)
  assert(sheet, 'At least one nonempty worksheet is required')
  const data = prepareDataset(sheet)
  assert(data.companyColumn >= 0, 'Company column must be present')
  const result = analyzeRows(data.rows, data.companyColumn, freshDefaultRules())
  assert.equal(result.projects.reduce((sum, row) => sum + row.invoiceCount, 0), result.totalInvoices)
  assert.equal(result.clerks.reduce((sum, row) => sum + row.invoiceCount, 0), result.totalInvoices)
  return { file: basename(path), total: result.totalInvoices, projects: result.projectCount, unknown: result.unknownInvoices, clerks: result.clerks, projectCounts: result.projects }
})
for (const result of results.slice(1)) {
  assert.equal(result.total, results[0].total)
  assert.equal(result.unknown, results[0].unknown)
  assert.deepEqual(result.clerks, results[0].clerks)
  assert.deepEqual(result.projectCounts, results[0].projectCounts)
}
console.log(JSON.stringify({ verifiedEquivalent: results.length > 1, results }, null, 2))
