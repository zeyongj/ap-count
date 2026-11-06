import { describe, expect, test } from 'vitest'
import { analyzeRows, compileRules, extractProjectNumber, toCsv, validateRules, projectCountsCsv, apCountsCsv, unknownRowsCsv } from '../src/lib/analysis'
import { freshDefaultRules } from '../src/lib/default-rules'
import type { APPortfolio } from '../src/lib/types'

// Independent literal translation of the user-provided Python, kept as a regression oracle.
function pythonAssign(p: number | null): string {
  if (p === null) return 'Unknown'
  const j_excl = new Set([5061,5266,5133,5134,5135,5167,5198,5200,5255])
  if (((5006 <= p && p <= 5216) || [5260,5261].includes(p)) && !j_excl.has(p)) return 'Angie Cardona'
  const l_excl = new Set([5260,5261,5256,5257,5258])
  if (((5218 <= p && p <= 5337) || p === 5200) && !l_excl.has(p)) return 'Jason Jin'
  if (5339 <= p && p <= 5527 && !new Set([5377,5381,5386,5504,5521]).has(p)) return 'David Wong'
  if (5528 <= p && p <= 5626 && !new Set([5594,5598,5556,5571]).has(p)) return 'Anson Lau'
  if (5627 <= p && p <= 5720 && !new Set([5661,5699]).has(p)) return 'Narges Hadipour'
  if (5721 <= p && p <= 5790 && !new Set([5739,5750,5767,5769,5775]).has(p)) return 'Ruby Tam'
  if (p >= 5791 || new Set([5061,5266,5133,5134,5135,5198,5255,5167,5256,5257,5258,5594,5598,5377,5381,5386,5504,5521,5556,5571,5661,5699,5739,5750,5767,5769,5775]).has(p)) return 'Steven Leung'
  return 'Unknown'
}
const rule = (id: string, start: number, end: number | null): APPortfolio => ({ id, name: id, ranges: [{ start, end }], include: [], exclude: [] })

describe('project extraction and faithful defaults', () => {
  test('brackets take precedence over earlier digits', () => {
    expect(extractProjectNumber('2026 Company [05419]')).toBe(5419)
    expect(extractProjectNumber('Project 5200, division 4')).toBe(5200)
    expect(extractProjectNumber(5791)).toBe(5791)
    for (const value of [null, undefined, '', 'no project', '   ']) expect(extractProjectNumber(value)).toBeNull()
    expect(extractProjectNumber('9007199254740992')).toBeNull()
  })
  test('all 0..10000 projects match the original Python', () => {
    const assign = compileRules(freshDefaultRules())
    for (let project = 0; project <= 10000; project++) expect(assign(project)?.name ?? 'Unknown', `project ${project}`).toBe(pythonAssign(project))
    expect(assign(null)).toBeNull()
    expect(assign(Number.MAX_SAFE_INTEGER)?.name).toBe('Steven Leung')
  })
  test('each source row is counted once, including duplicates and missing projects', () => {
    const result = analyzeRows([
      { sourceRow: 2, values: ['Company [5200]', 'INV-1'] },
      { sourceRow: 3, values: ['Company [5200]', 'INV-1'] },
      { sourceRow: 4, values: ['Company [5217]', 'INV-2'] },
      { sourceRow: 5, values: ['', 'INV-3'] },
    ], 0, freshDefaultRules())
    expect(result.totalInvoices).toBe(4)
    expect(result.unknownInvoices).toBe(2)
    expect(result.projectCount).toBe(2)
    expect(result.projects.reduce((sum, row) => sum + row.invoiceCount, 0)).toBe(4)
    expect(result.clerks.reduce((sum, row) => sum + row.invoiceCount, 0)).toBe(4)
    expect(result.clerks.find(row => row.ap === 'Jason Jin')?.invoiceCount).toBe(2)
    expect(result.unknown.map(row => row.sourceRow)).toEqual([4, 5])
    expect(projectCountsCsv(result)).toContain('5200,2')
    expect(apCountsCsv(result)).toContain('Jason Jin,2')
    expect(unknownRowsCsv(result, ['Company', 'Invoice No'])).toContain('4,Company [5217],INV-2,5217,Unknown,unassigned-project')
  })
})

describe('editable distributions', () => {
  test('explicit projects cannot silently override another clerk range', () => {
    const rules = [rule('A', 5000, 6000), { ...rule('B', 7000, null), include: [5419] }]
    expect(validateRules(rules)[0].code).toBe('overlap')
    expect(() => compileRules(rules)).toThrow('Choose which AP clerk')
    rules[0].exclude = [5419]
    expect(validateRules(rules)).toEqual([])
    const assign = compileRules(rules)
    expect(assign(5419)?.name).toBe('B')
    expect(assign(5418)?.name).toBe('A')
  })
  test('overlap cannot silently assign the wrong AP', () => {
    expect(validateRules([rule('A', 1, 10), rule('B', 8, 12)])[0].code).toBe('overlap')
    expect(() => compileRules([rule('A', 1, 10), rule('B', 8, 12)])).toThrow()
    expect(validateRules([{ ...rule('A', 1, 10), exclude: [8, 9, 10] }, rule('B', 8, 12)])).toEqual([])
  })
  test('multiple same-owner ranges merge correctly', () => {
    const a = { ...rule('A', 1, 100), ranges: [{ start: 1, end: 100 }, { start: 10, end: 20 }] }
    const assign = compileRules([a, rule('B', 200, 300)])
    expect(assign(90)?.name).toBe('A')
    expect(assign(150)).toBeNull()
    expect(assign(200)?.name).toBe('B')
  })
  test('duplicate includes, invalid names and invalid IDs reject', () => {
    expect(validateRules([{ ...rule('A', 1, 10), include: [20] }, { ...rule('B', 30, 40), include: [20] }])[0].code).toBe('duplicate-include')
    expect(validateRules([{ ...rule('A', 1, 10), name: 'Unknown' }])[0].code).toBe('name')
    expect(validateRules([{ ...rule('A', 1, 10), exclude: [-1] }])[0].code).toBe('project')
    expect(validateRules([{ ...rule('A', 1, 10), include: [5], exclude: [5] }])[0].code).toBe('include-exclude')
    expect(validateRules({})).not.toEqual([])
    expect(validateRules([null])).not.toEqual([])
  })
})

test('CSV quotes commas/quotes/newlines and neutralizes spreadsheet formulas', () => {
  expect(toCsv([['name', 'count'], ['a,"b"', 1], ['=HYPERLINK("bad")', 2], ['  +SUM(A1)', 3], ['hello\nworld', 4]])).toBe('\uFEFFname,count\r\n"a,""b""",1\r\n"\'=HYPERLINK(""bad"")",2\r\n\'  +SUM(A1),3\r\n"hello\nworld",4\r\n')
})
