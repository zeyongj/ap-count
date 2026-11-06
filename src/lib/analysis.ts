import type { APPortfolio, RuleIssue, SourceRow, AnalysisResult, AnalyzedRow, ProjectCount, APCount } from './types'
import { findAssignmentConflicts } from './conflicts'

const validProject = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const MAX_PROJECT = Number.MAX_SAFE_INTEGER
interface Segment { start: number; end: number; rule: APPortfolio }

/** Bracketed digits win; otherwise use the first group of digits, as in the Python. */
export function extractProjectNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const text = String(value)
  const match = text.match(/\[(\d+)\]/) ?? text.match(/(\d+)/)
  if (!match) return null
  const result = Number(match[1])
  return validProject(result) ? result : null
}

/** Make non-overlapping effective intervals after explicit assignments and exclusions. */
function segmentsFor(rules: APPortfolio[]): Segment[] {
  const explicit = new Set(rules.flatMap(rule => rule.include))
  const segments: Segment[] = []
  for (const rule of rules) {
    const omitted = [...new Set([...rule.exclude, ...explicit])].sort((a, b) => a - b)
    for (const range of rule.ranges) {
      const end = range.end ?? MAX_PROJECT
      let cursor = range.start
      for (const project of omitted) {
        if (project < cursor) continue
        if (project > end) break
        if (project > cursor) segments.push({ start: cursor, end: project - 1, rule })
        cursor = project + 1
      }
      if (cursor <= end) segments.push({ start: cursor, end, rule })
    }
  }
  return segments.sort((a, b) => a.start - b.start || a.end - b.end)
}

export function validateRules(input: unknown): RuleIssue[] {
  const issues: RuleIssue[] = []
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) {
    return [{ code: 'rules', message: 'Provide between 1 and 100 AP portfolios.', ruleIds: [] }]
  }
  const rules = input as APPortfolio[]
  const ids = new Set<string>(), names = new Set<string>()
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') { issues.push({ code: 'schema', message: 'Each portfolio must be an object.', ruleIds: [] }); continue }
    const ruleId = typeof rule.id === 'string' ? rule.id : ''
    const ref = [ruleId]
    if (!ruleId.trim() || ids.has(ruleId)) issues.push({ code: 'id', message: 'Every portfolio needs a unique ID.', ruleIds: ref })
    ids.add(ruleId)
    if (typeof rule.name !== 'string' || !rule.name.trim() || rule.name.trim().toLowerCase() === 'unknown' || names.has(rule.name.trim().toLowerCase())) issues.push({ code: 'name', message: 'AP names must be unique, nonempty, and cannot be Unknown.', ruleIds: ref })
    if (typeof rule.name === 'string') names.add(rule.name.trim().toLowerCase())
    if (!Array.isArray(rule.ranges) || !Array.isArray(rule.include) || !Array.isArray(rule.exclude)) { issues.push({ code: 'schema', message: 'Each portfolio needs ranges, include, and exclude arrays.', ruleIds: ref }); continue }
    if (rule.ranges.length > 100 || rule.include.length > 10000 || rule.exclude.length > 10000) issues.push({ code: 'size', message: 'A portfolio may have up to 100 ranges and 10,000 individual projects.', ruleIds: ref })
    for (const range of rule.ranges) if (!range || !validProject(range.start) || (range.end !== null && (!validProject(range.end) || range.end < range.start))) issues.push({ code: 'range', message: 'Ranges need a nonnegative whole-number start and an end at least as large (or null for no upper limit).', ruleIds: ref })
    for (const field of ['include', 'exclude'] as const) if (rule[field].some(value => !validProject(value))) issues.push({ code: 'project', message: 'Project IDs must be nonnegative safe whole numbers.', ruleIds: ref })
    const excluded = new Set(rule.exclude)
    for (const project of rule.include) if (excluded.has(project)) issues.push({ code: 'include-exclude', message: `Project ${project} cannot be included and excluded in the same portfolio.`, ruleIds: ref, project })
  }
  if (issues.length) return issues
  for (const conflict of findAssignmentConflicts(rules)) {
    const duplicateInclude = conflict.end === conflict.start && conflict.owners.every(owner => rules.find(rule => rule.id === owner.id)!.include.includes(conflict.start))
    const interval = conflict.end === null ? `${conflict.start}+` : conflict.end === conflict.start ? String(conflict.start) : `${conflict.start}–${conflict.end}`
    issues.push({
      code: duplicateInclude ? 'duplicate-include' : 'overlap',
      message: `Project${conflict.start === conflict.end ? '' : 's'} ${interval} ${conflict.start === conflict.end ? 'is' : 'are'} assigned to ${conflict.owners.map(owner => owner.name).join(', ')}. Choose which AP clerk is responsible before saving.`,
      ruleIds: conflict.owners.map(owner => owner.id), project: conflict.start,
    })
  }
  return issues
}

export function compileRules(rules: APPortfolio[]) {
  const issues = validateRules(rules)
  if (issues.length) throw new Error(issues.map(issue => issue.message).join('\n'))
  const explicit = new Map<number, APPortfolio>()
  for (const rule of rules) for (const project of rule.include) explicit.set(project, rule)
  const segments = segmentsFor(rules)
  // Collapse overlapping intervals belonging to the same AP before binary search.
  const merged: Segment[] = []
  for (const segment of segments) {
    const last = merged.at(-1)
    if (last && last.rule.id === segment.rule.id && segment.start <= last.end + 1) last.end = Math.max(last.end, segment.end)
    else merged.push({ ...segment })
  }
  return (project: number | null): APPortfolio | null => {
    if (project === null || !validProject(project)) return null
    const owner = explicit.get(project)
    if (owner) return owner
    let low = 0, high = merged.length - 1
    while (low <= high) {
      const mid = (low + high) >>> 1
      const segment = merged[mid]
      if (project < segment.start) high = mid - 1
      else if (project > segment.end) low = mid + 1
      else return segment.rule
    }
    return null
  }
}

export function analyzeRows(rows: SourceRow[], companyColumn: number, rules: APPortfolio[]): AnalysisResult {
  if (!Number.isInteger(companyColumn) || companyColumn < 0) throw new Error('Choose a Company column before analyzing.')
  const assign = compileRules(rules)
  const projectMap = new Map<number | null, ProjectCount>()
  const clerkMap = new Map<string | null, APCount>(rules.map(rule => [rule.id, { id: rule.id, ap: rule.name.trim(), invoiceCount: 0, share: 0 }]))
  const analyzed: AnalyzedRow[] = rows.map(row => {
    const projectNumber = extractProjectNumber(row.values[companyColumn])
    const owner = assign(projectNumber)
    const ap = owner?.name.trim() ?? 'Unknown'
    const apId = owner?.id ?? null
    const project = projectMap.get(projectNumber) ?? { projectNumber, invoiceCount: 0, ap }
    project.invoiceCount++
    projectMap.set(projectNumber, project)
    const clerk = clerkMap.get(apId) ?? { id: null, ap: 'Unknown', invoiceCount: 0, share: 0 }
    clerk.invoiceCount++
    clerkMap.set(apId, clerk)
    return { ...row, projectNumber, ap, apId, reason: owner ? 'assigned' : projectNumber === null ? 'missing-project' : 'unassigned-project' }
  })
  const unknown = analyzed.filter(row => row.apId === null)
  const clerks = [...clerkMap.values()].map(clerk => ({ ...clerk, share: rows.length ? clerk.invoiceCount / rows.length : 0 })).sort((a, b) => b.invoiceCount - a.invoiceCount || a.ap.localeCompare(b.ap))
  return {
    totalInvoices: rows.length,
    projectCount: [...projectMap.keys()].filter(project => project !== null).length,
    assignedInvoices: rows.length - unknown.length,
    unknownInvoices: unknown.length,
    projects: [...projectMap.values()].sort((a, b) => a.projectNumber === null ? 1 : b.projectNumber === null ? -1 : a.projectNumber - b.projectNumber),
    clerks,
    unknown,
    rows: analyzed,
  }
}

/** RFC 4180, UTF-8 BOM for Excel, and formula-injection protection for text cells. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? '' : String(value)
    if (typeof value === 'string' && (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

export const projectCountsCsv = (result: AnalysisResult): string => toCsv([
  ['ProjectNumber', 'InvoiceCount'], ...result.projects.map(row => [row.projectNumber, row.invoiceCount]),
])
export const apCountsCsv = (result: AnalysisResult): string => toCsv([
  ['AP', 'InvoiceCount'], ...result.clerks.map(row => [row.ap, row.invoiceCount]),
])
export const unknownRowsCsv = (result: AnalysisResult, headers: string[]): string => toCsv([
  ['SourceRow', ...headers, 'ProjectNumber', 'AP', 'Reason'],
  ...result.unknown.map(row => [row.sourceRow, ...row.values, row.projectNumber, row.ap, row.reason]),
])
