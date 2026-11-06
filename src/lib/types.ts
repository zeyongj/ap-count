/** All invoice data stays in the browser; portfolio settings contain no invoices. */
export interface ProjectRange { start: number; end: number | null }
export interface APPortfolio {
  id: string
  name: string
  ranges: ProjectRange[]
  include: number[]
  exclude: number[]
}
export interface RuleIssue { code: string; message: string; ruleIds: string[]; project?: number }
export interface ParsedSheet { name: string; rows: string[][] }
export interface ParsedWorkbook { sheets: ParsedSheet[]; warnings: string[] }
export interface SourceRow { sourceRow: number; values: string[] }
export interface PreparedDataset {
  headers: string[]
  rows: SourceRow[]
  companyColumn: number
  skippedBlankRows: number
}
export interface AnalyzedRow extends SourceRow {
  projectNumber: number | null
  ap: string
  apId: string | null
  reason: 'assigned' | 'missing-project' | 'unassigned-project'
}
export interface ProjectCount { projectNumber: number | null; invoiceCount: number; ap: string }
export interface APCount { id: string | null; ap: string; invoiceCount: number; share: number }
export interface AnalysisResult {
  totalInvoices: number
  projectCount: number
  assignedInvoices: number
  unknownInvoices: number
  projects: ProjectCount[]
  clerks: APCount[]
  unknown: AnalyzedRow[]
  rows: AnalyzedRow[]
}
