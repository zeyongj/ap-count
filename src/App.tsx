import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowDownUp, ArrowRight, BarChart3, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, FileSpreadsheet, FolderKanban, Info, Layers3, LoaderCircle, LockKeyhole, Plus, RotateCcw, Search, Settings2, ShieldCheck, Trash2, Upload, Users, X, TriangleAlert } from 'lucide-react'
import { analyzeRows, apCountsCsv, projectCountsCsv, unknownRowsCsv, validateRules } from './lib/analysis'
import { freshDefaultRules } from './lib/default-rules'
import { inferHeaderRow, MAX_FILE_BYTES, parseWorkbook, prepareDataset } from './lib/parse'
import type { APPortfolio, ParsedWorkbook, ProjectCount, RuleIssue } from './lib/types'
import './styles.css'

type Language = 'en' | 'zh'
type Tab = 'clerks' | 'projects' | 'unknown'
const STORAGE_KEY = 'ap-count-portfolios-v1'
const PAGE_SIZE = 10
const copy = {
  en: {
    language:'Language', private:'Private by design', eyebrow:'ACCOUNTS PAYABLE WORKSPACE', title:'Every invoice, accounted for.', subtitle:'Turn your invoice file into a clear view of AP workloads.', portfolios:'Manage portfolios', guide:'How it works', importTitle:'Invoice file', drop:'Drop your invoice file here', dropSub:'or choose a file from your computer', browse:'Browse files', fileLimit:'XLS, XLSX or CSV · up to 25 MB', privacy:'Your invoice data stays in this browser. Nothing is uploaded.', or:'JUST EXPLORING?', demo:'Try with demo data', loading:'Reading your file…', workbook:'Workbook sheet', header:'Header row', company:'Company column', chooseColumn:'Select the Company column', rows:'data rows', blankRows:'blank rows skipped', reset:'Remove file', rulesTitle:'AP distribution', activeClerks:'AP clerks', distribution:'Portfolio rules', defaultRules:'Original distribution', customRules:'Custom distribution', rulesNote:'Project ranges and exceptions determine who owns each invoice.', editRules:'Edit portfolio rules', total:'Total invoices', projects:'Projects', clerks:'AP clerks', unknown:'Needs review', totalFoot:'Every nonblank data row', projectsFoot:'Distinct project numbers', clerkFoot:'With assigned invoices', unknownFoot:'Unassigned or missing project', resultTitle:'Invoice breakdown', ready:'Analysis ready', awaiting:'Awaiting a file', byClerk:'By AP clerk', byProject:'By project', review:'Unknown rows', emptyTitle:'Your invoice summary starts here', emptyText:'Add an invoice file to see counts by AP clerk and project, with any unassigned rows flagged for review.', ap:'AP clerk', invoices:'Invoices', share:'Share', project:'Project', noProject:'Missing project', exportAp:'Download AP counts', exportProject:'Download project counts', exportUnknown:'Download unknown rows', exportNote:'CSV exports include all results, regardless of search or page.', search:'Search project or AP clerk…', noMatches:'No matching projects.', unknownNote:'These rows could not be assigned. Review their Company values or update your portfolio rules.', sourceRow:'Source row', reason:'Reason', missingProject:'No project number', unassignedProject:'Project has no owner', allAssigned:'All invoices have an AP clerk.', noRows:'This sheet has no invoice rows below the selected header.', columnNote:'Select the column containing the Company / project text to continue.', countMethod:'A count you can trace', method:'Each nonblank data row counts as one invoice, including repeated invoice numbers. Project numbers in [brackets] take priority; otherwise, the first number in Company is used.', step1:'Add your invoice file', step1Text:'Use the original Excel report or an exported CSV.', step2:'Check the distribution', step2Text:'Update AP ranges and exceptions whenever portfolios change.', step3:'Review and download', step3Text:'Explore the counts and export the two summary CSVs.', footer:'© 2026 Zeyong Jin. All rights reserved.', localOnly:'Processed locally · No account required', fileError:'We couldn’t read this file.', invalidType:'Choose an .xls, .xlsx or .csv file.', tooLarge:'The file is larger than 25 MB. Please use a smaller file.', onlyOne:'Please select one invoice file at a time.', warnings:'File notes', close:'Close', rowsShown:'Showing', of:'of', previous:'Previous page', next:'Next page', page:'Page', portfolioTitle:'Manage AP portfolios', portfolioSubtitle:'Edit names, project ranges and exceptions. Saving recalculates your current invoice file.', rulesBehavior:'Explicit project assignments take priority over ranges. Exclusions remove a project from a range. Conflicting assignments must be resolved before saving.', exportRules:'Export rules', importRules:'Import rules', restore:'Restore defaults', addClerk:'Add AP clerk', name:'AP clerk name', ranges:'Project ranges', start:'From', end:'To', noLimit:'No upper limit', addRange:'Add range', includes:'Explicit assignments', excludes:'Excluded projects', listHelp:'Separate project numbers with commas or spaces.', rangeHelp:'Leave “To” empty for all project numbers from “From” onward.', removeClerk:'Remove AP clerk', removeRange:'Remove range', save:'Save & recalculate', cancel:'Cancel', localRules:'Rules are saved in this browser. Export them to share or back them up.', newClerk:'New AP clerk', defaultConfirm:'Replace your draft with the original seven-clerk distribution?', defaultConfirmButton:'Use original rules', saved:'Portfolio rules saved. Counts have been updated.', sessionSaved:'Rules are active for this session. Browser storage is unavailable; export a backup.', invalidSaved:'Saved rules could not be loaded. Original rules are being used.', importError:'We couldn’t import these rules.', invalidJson:'Choose a valid AP Count rules JSON file.', importTooLarge:'The rules file is too large (maximum 1 MB).', imported:'Rules imported into the draft. Review them, then save.', download:'Download', demoBadge:'Synthetic demo data', badHeader:'Choose a valid header row for this sheet.', companyNone:'No Company column was detected.', validation:'Resolve these rule issues before saving:', invalidList:'Use only nonnegative whole project numbers, separated by commas or spaces.', invalidRange:'Project ranges need valid whole numbers and an end at least as large as the start.', emptyRules:'Add at least one AP clerk.', backupNote:'Importing or restoring rules changes this draft. Save to apply your changes.', clearNotice:'Dismiss notification', unknownCount:'Unknown', sourcePreview:'Source columns', fileReadDetail:'Try a different sheet, header row, or a fresh Excel / UTF-8 CSV export.', demoName:'demo-invoices.csv', updated:'Current distribution', countScope:'Counts cover the selected sheet only.', importDraft:'Draft updated', noData:'No data', 
  },
  zh: {
    language:'语言', private:'注重数据隐私', eyebrow:'应付账款工作台', title:'每一张发票，都清晰有数。', subtitle:'导入发票文件，即可查看各 AP 的工作量。', portfolios:'管理 AP 分配', guide:'使用说明', importTitle:'发票文件', drop:'将发票文件拖放到这里', dropSub:'或从电脑中选择一个文件', browse:'选择文件', fileLimit:'XLS、XLSX 或 CSV · 最大 25 MB', privacy:'发票数据仅在当前浏览器内处理，不会上传。', or:'想先体验一下？', demo:'试用演示数据', loading:'正在读取文件…', workbook:'工作表', header:'表头行', company:'Company 所在列', chooseColumn:'请选择 Company 所在列', rows:'条数据', blankRows:'个空白行已跳过', reset:'移除文件', rulesTitle:'AP 项目分配', activeClerks:'AP 人员', distribution:'分配规则', defaultRules:'原始分配', customRules:'自定义分配', rulesNote:'根据项目编号范围及例外项目，为每张发票分配 AP。', editRules:'编辑项目分配', total:'发票总数', projects:'项目数', clerks:'AP 人员数', unknown:'待核对', totalFoot:'每个非空数据行计一张', projectsFoot:'不同的项目编号', clerkFoot:'已分配到发票的人员', unknownFoot:'未分配或缺少项目编号', resultTitle:'发票统计', ready:'统计已完成', awaiting:'等待导入文件', byClerk:'按 AP 人员', byProject:'按项目', review:'未分配明细', emptyTitle:'从这里开始统计发票', emptyText:'导入发票文件，查看各 AP 人员与各项目的发票数量，并核对未分配的数据行。', ap:'AP 人员', invoices:'发票数', share:'占比', project:'项目', noProject:'缺少项目编号', exportAp:'下载 AP 统计', exportProject:'下载项目统计', exportUnknown:'下载未分配明细', exportNote:'CSV 包含全部统计结果，不受搜索或分页影响。', search:'搜索项目或 AP 人员…', noMatches:'没有符合条件的项目。', unknownNote:'以下数据行尚未分配 AP。请核对 Company 内容或调整 AP 项目分配规则。', sourceRow:'原始行号', reason:'原因', missingProject:'未找到项目编号', unassignedProject:'项目尚未分配人员', allAssigned:'所有发票均已分配 AP 人员。', noRows:'所选表头下方没有发票数据。', columnNote:'请选择包含 Company / 项目信息的列后继续。', countMethod:'可追溯的统计口径', method:'每个非空数据行计为一张发票，重复发票号也会计入。优先提取 [方括号] 内的项目编号；否则使用 Company 中的第一个数字。', step1:'导入发票文件', step1Text:'可直接使用原始 Excel 报表，或转换后的 CSV。', step2:'检查项目分配', step2Text:'人员负责项目发生变化时，调整范围及例外项目。', step3:'核对并下载', step3Text:'查看统计结果，并导出两份汇总 CSV 文件。', footer:'© 2026 Zeyong Jin. 保留所有权利。', localOnly:'本地处理 · 无需登录', fileError:'无法读取此文件。', invalidType:'请选择 .xls、.xlsx 或 .csv 文件。', tooLarge:'文件超过 25 MB，请使用较小的文件。', onlyOne:'每次请选择一个发票文件。', warnings:'文件提示', close:'关闭', rowsShown:'显示', of:'共', previous:'上一页', next:'下一页', page:'第', portfolioTitle:'管理 AP 项目分配', portfolioSubtitle:'修改人员姓名、项目编号范围及例外项目。保存后会重新统计当前文件。', rulesBehavior:'明确指定的项目优先于编号范围。排除项目不参与范围分配。保存前必须解决分配冲突。', exportRules:'导出规则', importRules:'导入规则', restore:'恢复原始分配', addClerk:'添加 AP 人员', name:'AP 人员姓名', ranges:'项目编号范围', start:'起始', end:'截止', noLimit:'无上限', addRange:'添加范围', includes:'明确分配的项目', excludes:'排除的项目', listHelp:'用逗号或空格分隔项目编号。', rangeHelp:'截止留空，表示包含起始编号及其后的所有项目。', removeClerk:'删除 AP 人员', removeRange:'删除范围', save:'保存并重新统计', cancel:'取消', localRules:'规则保存在当前浏览器。可导出规则用于分享或备份。', newClerk:'新 AP 人员', defaultConfirm:'是否将草稿替换为原始的七位 AP 人员分配规则？', defaultConfirmButton:'使用原始规则', saved:'分配规则已保存，统计已更新。', sessionSaved:'规则在本次使用中已生效。浏览器无法保存设置，请导出规则备份。', invalidSaved:'无法载入已保存的规则，现使用原始分配。', importError:'无法导入这些规则。', invalidJson:'请选择有效的 AP Count 规则 JSON 文件。', importTooLarge:'规则文件过大（最大 1 MB）。', imported:'规则已导入草稿。请检查后保存。', download:'下载', demoBadge:'模拟演示数据', badHeader:'请选择此工作表内有效的表头行。', companyNone:'未检测到 Company 列。', validation:'保存前请解决以下规则问题：', invalidList:'项目编号只能使用非负整数，请用逗号或空格分隔。', invalidRange:'项目范围须为有效整数，截止编号不得小于起始编号。', emptyRules:'请至少添加一位 AP 人员。', backupNote:'导入或恢复规则将修改当前草稿，保存后才会生效。', clearNotice:'关闭通知', unknownCount:'未分配', sourcePreview:'原始列', fileReadDetail:'请尝试其他工作表、表头行，或重新导出 Excel / UTF-8 CSV。', demoName:'demo-invoices.csv', updated:'当前分配', countScope:'统计仅包含当前选中的工作表。', importDraft:'草稿已更新', noData:'无数据',
  },
}
type Copy = typeof copy.en
const uid = () => globalThis.crypto?.randomUUID?.() ?? `ap-${Date.now()}-${Math.random().toString(16).slice(2)}`
function readRules(): { rules: APPortfolio[]; invalid: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { rules:freshDefaultRules(), invalid:false }
    const saved = JSON.parse(raw)
    if (saved.version !== 1 || validateRules(saved.portfolios).length) return { rules:freshDefaultRules(), invalid:true }
    return { rules:saved.portfolios, invalid:false }
  } catch { return { rules:freshDefaultRules(), invalid:true } }
}
function download(text:string, filename:string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text],{type}))
  const anchor = document.createElement('a'); anchor.href=url; anchor.download=filename
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function serializeRules(rules:APPortfolio[]) { return JSON.stringify({version:1,portfolios:rules},null,2)+'\n' }
function localIssue(issue:RuleIssue, language:Language, rules:APPortfolio[]):string {
  if (language === 'en') return issue.message
  const names = issue.ruleIds.map(id => rules.find(rule => rule.id===id)?.name || id).join('、')
  const prefix = names ? `${names}：` : ''
  const translations:Record<string,string> = {
    rules:'请配置 1 至 100 位 AP 人员。',schema:'每项规则需要有效的姓名、范围、明确分配及排除项目。',id:'每位 AP 必须拥有不同且非空的 ID。',name:'姓名不得为空、重复或使用 Unknown。',size:'每位人员最多配置 100 个范围及 10,000 个项目。',range:'范围的起始、截止须为非负整数，截止不得小于起始；null 表示无上限。',project:'项目编号必须为有效的非负整数。','include-exclude':`项目 ${issue.project} 不能同时包含和排除。`,'duplicate-include':`项目 ${issue.project} 被明确分配给多位 AP。`,overlap:`项目 ${issue.project} 的范围分配发生冲突。请指定一位负责人，或调整范围、排除项目。`,
  }
  return prefix+(translations[issue.code]??'规则配置无效，请检查。')
}
const demo:ParsedWorkbook = {warnings:[],sheets:[{name:'Demo invoices',rows:[['Invoice','Company','Vendor'],...[
  ['DEMO-001','Example Residence [5006]','Demo supplier A'],['DEMO-002','Example Residence [5006]','Demo supplier B'],['DEMO-003','Example Residence [5200]','Demo supplier C'],['DEMO-004','Example Residence [5250]','Demo supplier A'],['DEMO-005','Example Residence [5400]','Demo supplier B'],['DEMO-006','Example Residence [5400]','Demo supplier C'],['DEMO-007','Example Residence [5550]','Demo supplier A'],['DEMO-008','Example Residence [5670]','Demo supplier B'],['DEMO-009','Example Residence [5740]','Demo supplier C'],['DEMO-010','Example Residence [5791]','Demo supplier A'],['DEMO-011','Example Residence [5061]','Demo supplier B'],['DEMO-012','Needs project review','Demo supplier C'],
]]}]}

interface DraftRule {id:string;name:string;ranges:{start:string;end:string}[];include:string;exclude:string}
function toDraft(rules:APPortfolio[]):DraftRule[] { return rules.map(rule=>({...rule,ranges:rule.ranges.map(r=>({start:String(r.start),end:r.end===null?'':String(r.end)})),include:rule.include.join(', '),exclude:rule.exclude.join(', ')})) }
function parseList(text:string):number[] {
  if (!text.trim()) return []
  const parts = text.trim().split(/[\s,，;；]+/)
  if (parts.some(part=>!/^\d+$/.test(part)||!Number.isSafeInteger(Number(part)))) throw new Error('list')
  return [...new Set(parts.map(Number))]
}
function compileDraft(draft:DraftRule[]):APPortfolio[] {
  return draft.map(rule=>({id:rule.id,name:rule.name.trim(),include:parseList(rule.include),exclude:parseList(rule.exclude),ranges:rule.ranges.map(range=>{
    if (!/^\d+$/.test(range.start)||!Number.isSafeInteger(Number(range.start))|| (range.end!==''&&(!/^\d+$/.test(range.end)||!Number.isSafeInteger(Number(range.end))))) throw new Error('range')
    return {start:Number(range.start),end:range.end===''?null:Number(range.end)}
  })}))
}
function PortfolioEditor({rules,language,onClose,onSave}:{rules:APPortfolio[];language:Language;onClose:()=>void;onSave:(rules:APPortfolio[])=>void}) {
  const t = copy[language]
  const [draft,setDraft] = useState(()=>toDraft(rules))
  const [restore,setRestore] = useState(false)
  const [notice,setNotice] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const compiled = useMemo(()=>{try { const value=compileDraft(draft); return {value,issues:validateRules(value),parseError:''} }catch(error){return {value:[] as APPortfolio[],issues:[] as RuleIssue[],parseError:(error as Error).message}}},[draft])
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null; const previousOverflow=document.body.style.overflow; document.body.style.overflow='hidden'
    modalRef.current?.querySelector<HTMLElement>('button')?.focus()
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape') onClose()
      if(event.key!=='Tab') return
      const focusables=modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,[tabindex="0"]')
      if(!focusables?.length)return
      const first=focusables[0], last=focusables[focusables.length-1]
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',handleKey)
    return ()=>{document.removeEventListener('keydown',handleKey);document.body.style.overflow=previousOverflow;previous?.focus()}
  },[onClose])
  function update(id:string,patch:Partial<DraftRule>){setDraft(current=>current.map(rule=>rule.id===id?{...rule,...patch}:rule))}
  async function importRules(file?:File){
    if(!file)return
    try{
      if(file.size>1024*1024)throw new Error(t.importTooLarge)
      const parsed=JSON.parse(await file.text()); const imported=Array.isArray(parsed)?parsed:parsed.version===1?parsed.portfolios:null
      const issues=validateRules(imported)
      if(issues.length)throw new Error(issues.slice(0,4).map(issue=>localIssue(issue,language,Array.isArray(imported)?imported:[])).join(' '))
      setDraft(toDraft(imported));setNotice(t.imported);setRestore(false)
    }catch(error){setNotice(t.importError+' '+(error instanceof SyntaxError?t.invalidJson:(error as Error).message))}
  }
  const hasErrors=Boolean(compiled.parseError||compiled.issues.length)
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="portfolio-title" aria-describedby="portfolio-description">
      <div className="modal-header"><div><h2 id="portfolio-title">{t.portfolioTitle}</h2><p id="portfolio-description">{t.portfolioSubtitle}</p></div><button className="icon-button ghost" onClick={onClose} aria-label={t.close}><X/></button></div>
      <div className="modal-content">
        <div className="notice"><Info/><div>{t.rulesBehavior}</div></div>
        <div className="rules-toolbar"><div>
          <button disabled={hasErrors} onClick={()=>download(serializeRules(compiled.value),'ap-portfolio-rules.json','application/json')}><ArrowDownToLine/>{t.exportRules}</button>
          <button onClick={()=>importRef.current?.click()}><Upload/>{t.importRules}</button>
          <input ref={importRef} className="hidden-input" type="file" accept=".json,application/json" aria-label={t.importRules} onChange={event=>{void importRules(event.target.files?.[0]);event.target.value=''}}/>
          <button onClick={()=>setRestore(true)}><RotateCcw/>{t.restore}</button>
        </div><button className="primary" onClick={()=>setDraft(current=>[...current,{id:uid(),name:`${t.newClerk} ${current.length+1}`,ranges:[],include:'',exclude:''}])} disabled={draft.length>=100}><Plus/>{t.addClerk}</button></div>
        {restore?<div className="confirm-defaults">{t.defaultConfirm}<div><button className="small" onClick={()=>setRestore(false)}>{t.cancel}</button><button className="small primary" onClick={()=>{setDraft(toDraft(freshDefaultRules()));setRestore(false);setNotice('')}}>{t.defaultConfirmButton}</button></div></div>:null}
        {notice?<div className="notice" role="status"><Info/><div>{notice}</div><button className="ghost" onClick={()=>setNotice('')} aria-label={t.clearNotice}><X/></button></div>:null}
        {hasErrors?<div className="notice error" role="alert"><TriangleAlert/><div><strong>{t.validation}</strong><ul className="rule-error-list">{compiled.parseError?<li>{compiled.parseError==='list'?t.invalidList:t.invalidRange}</li>:compiled.issues.slice(0,8).map((issue,i)=><li key={`${issue.code}-${i}`}>{localIssue(issue,language,compiled.value)}</li>)}</ul></div></div>:null}
        {draft.length===0?<p className="empty-rules">{t.emptyRules}</p>:draft.map((rule,index)=><section className="rule-card" key={rule.id} aria-label={`${t.ap} ${index+1}`}>
          <div className="rule-card-heading"><span className="avatar">{index+1}</span><label className="field"><span>{t.name}</span><input aria-label={`${t.name} ${index+1}`} value={rule.name} onChange={event=>update(rule.id,{name:event.target.value})} maxLength={100}/></label><button className="icon-button ghost danger" onClick={()=>setDraft(current=>current.filter(item=>item.id!==rule.id))} aria-label={`${t.removeClerk}: ${rule.name}`} title={t.removeClerk}><Trash2/></button></div>
          <p className="range-label">{t.ranges}</p>
          {rule.ranges.map((range,r)=><div className="range-row" key={r}><input type="text" inputMode="numeric" aria-label={`${rule.name} ${t.start} ${r+1}`} placeholder={t.start} value={range.start} onChange={event=>update(rule.id,{ranges:rule.ranges.map((item,i)=>i===r?{...item,start:event.target.value}:item)})}/><span>–</span><input type="text" inputMode="numeric" aria-label={`${rule.name} ${t.end} ${r+1}`} placeholder={t.noLimit} value={range.end} onChange={event=>update(rule.id,{ranges:rule.ranges.map((item,i)=>i===r?{...item,end:event.target.value}:item)})}/><button className="icon-button ghost" onClick={()=>update(rule.id,{ranges:rule.ranges.filter((_,i)=>i!==r)})} aria-label={`${rule.name} ${t.removeRange} ${r+1}`}><X/></button></div>)}
          <button className="rule-add-range" onClick={()=>update(rule.id,{ranges:[...rule.ranges,{start:'',end:''}]})} disabled={rule.ranges.length>=100}><Plus/>{t.addRange}</button>
          <p className="field-help">{t.rangeHelp}</p>
          <div className="rule-fields"><label className="field">{t.includes}<textarea value={rule.include} placeholder="5260, 5261" onChange={event=>update(rule.id,{include:event.target.value})}/><span className="field-help">{t.listHelp}</span></label><label className="field">{t.excludes}<textarea value={rule.exclude} placeholder="5061, 5200" onChange={event=>update(rule.id,{exclude:event.target.value})}/><span className="field-help">{t.listHelp}</span></label></div>
        </section>)}
      </div>
      <div className="modal-footer"><p>{t.localRules}</p><div><button onClick={onClose}>{t.cancel}</button><button className="primary" disabled={hasErrors} onClick={()=>onSave(compiled.value)}><Check/>{t.save}</button></div></div>
    </div>
  </div>
}

export default function App(){
  const [language,setLanguage]=useState<Language>('en')
  const t:Copy=copy[language]
  const [initial]=useState(readRules)
  const [rules,setRules]=useState(initial.rules)
  const [workbook,setWorkbook]=useState<ParsedWorkbook|null>(null)
  const [filename,setFilename]=useState('')
  const [fileSize,setFileSize]=useState(0)
  const [isDemo,setIsDemo]=useState(false)
  const [sheetIndex,setSheetIndex]=useState(0)
  const [headerRow,setHeaderRow]=useState(0)
  const [companyColumn,setCompanyColumn]=useState(-1)
  const [busy,setBusy]=useState(false)
  const [dragging,setDragging]=useState(false)
  const [error,setError]=useState<{key:keyof Copy;detail?:string}|null>(null)
  const [notice,setNotice]=useState<keyof Copy|null>(initial.invalid?'invalidSaved':null)
  const [editor,setEditor]=useState(false)
  const [tab,setTab]=useState<Tab>('clerks')
  const [search,setSearch]=useState('')
  const [page,setPage]=useState(0)
  const [unknownPage,setUnknownPage]=useState(0)
  const [sort,setSort]=useState<{field:'projectNumber'|'invoiceCount';direction:1|-1}>({field:'projectNumber',direction:1})
  const fileInput=useRef<HTMLInputElement>(null)
  const loadId=useRef(0)
  const guideRef=useRef<HTMLDivElement>(null)
  const sheet=workbook?.sheets[sheetIndex]
  const dataset=useMemo(()=>sheet&&Number.isInteger(headerRow)&&headerRow>=0&&headerRow<sheet.rows.length?prepareDataset(sheet,headerRow):null,[sheet,headerRow])
  const result=useMemo(()=>dataset&&companyColumn>=0&&companyColumn<dataset.headers.length?analyzeRows(dataset.rows,companyColumn,rules):null,[dataset,companyColumn,rules])
  const filteredProjects=useMemo(()=>{
    const needle=search.trim().toLowerCase()
    const rows=(result?.projects??[]).filter(row=>!needle||`${row.projectNumber??t.noProject} ${row.ap}`.toLowerCase().includes(needle))
    return rows.sort((a,b)=>{
      if(sort.field==='projectNumber')return a.projectNumber===null?1:b.projectNumber===null?-1:(a.projectNumber-b.projectNumber)*sort.direction
      return (a.invoiceCount-b.invoiceCount)*sort.direction||(a.projectNumber??Infinity)-(b.projectNumber??Infinity)
    })
  },[result,search,sort,t.noProject])
  const maxPage=Math.max(0,Math.ceil(filteredProjects.length/PAGE_SIZE)-1)
  const displayPage=Math.min(page,maxPage)
  const unknownMaxPage=Math.max(0,Math.ceil((result?.unknown.length??0)/PAGE_SIZE)-1)
  const displayUnknownPage=Math.min(unknownPage,unknownMaxPage)
  const activeClerks=result?.clerks.filter(clerk=>clerk.id!==null&&clerk.invoiceCount>0).length??0
  const isDefault=JSON.stringify(rules)===JSON.stringify(freshDefaultRules())
  useEffect(()=>{document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=language==='en'?'AP Count — Invoice workload analysis':'AP Count — 发票工作量统计'},[language])
  function selectWorkbook(next:ParsedWorkbook,name:string,size:number,demoFile=false){
    const firstSheet=next.sheets.findIndex(item=>item.rows.length>0);const selected=Math.max(firstSheet,0)
    const header=next.sheets[selected]?inferHeaderRow(next.sheets[selected]):0
    const prepared=next.sheets[selected]?.rows.length?prepareDataset(next.sheets[selected],header):null
    setWorkbook(next);setFilename(name);setFileSize(size);setIsDemo(demoFile);setSheetIndex(selected);setHeaderRow(header);setCompanyColumn(prepared?.companyColumn??-1);setTab('clerks');setPage(0);setUnknownPage(0);setSearch('');setError(null)
  }
  async function loadFile(file?:File){
    if(!file)return
    setError(null);setNotice(null)
    if(!/\.(xlsx?|csv)$/i.test(file.name)){setError({key:'invalidType'});return}
    if(file.size>MAX_FILE_BYTES){setError({key:'tooLarge'});return}
    const request=++loadId.current;setBusy(true)
    try{
      const buffer=await file.arrayBuffer()
      if(request!==loadId.current)return
      const parsed=parseWorkbook(buffer,file.name)
      if(!parsed.sheets.length)throw new Error('No worksheets found.')
      selectWorkbook(parsed,file.name,file.size)
    }catch(error){if(request===loadId.current)setError({key:'fileError',detail:(error as Error).message})}
    finally{if(request===loadId.current)setBusy(false)}
  }
  function removeFile(){loadId.current++;setWorkbook(null);setFilename('');setBusy(false);setError(null);setIsDemo(false);if(fileInput.current)fileInput.current.value=''}
  function changeSheet(index:number){
    if(!workbook)return
    const header=inferHeaderRow(workbook.sheets[index]);const next=workbook.sheets[index].rows.length?prepareDataset(workbook.sheets[index],header):null
    setSheetIndex(index);setHeaderRow(header);setCompanyColumn(next?.companyColumn??-1);setPage(0);setUnknownPage(0)
  }
  function changeHeader(value:string){
    const header=Number(value)-1;setHeaderRow(header);setPage(0);setUnknownPage(0)
    if(sheet&&Number.isInteger(header)&&header>=0&&header<sheet.rows.length)setCompanyColumn(prepareDataset(sheet,header).companyColumn)
    else setCompanyColumn(-1)
  }
  function saveRules(next:APPortfolio[]){
    setRules(next);setEditor(false);setNotice('saved')
    try{localStorage.setItem(STORAGE_KEY,serializeRules(next))}catch{setNotice('sessionSaved')}
  }
  function flipSort(field:'projectNumber'|'invoiceCount'){setSort(current=>({field,direction:current.field===field?current.direction===1?-1:1:field==='invoiceCount'?-1:1}));setPage(0)}
  function rowName(row:ProjectCount){return row.projectNumber===null?t.noProject:String(row.projectNumber)}
  const metricValues=[result?.totalInvoices,result?.projectCount,result?activeClerks:undefined,result?.unknownInvoices]
  const metricLabels=[t.total,t.projects,t.clerks,t.unknown]
  const metricFoots=[t.totalFoot,t.projectsFoot,t.clerkFoot,t.unknownFoot]
  const metricIcons=[FileSpreadsheet,FolderKanban,Users,TriangleAlert]
  const formatted=(value:number)=>new Intl.NumberFormat(language==='en'?'en-CA':'zh-CN').format(value)
  return <div className="app">
    <header className="topbar"><div className="brand"><span className="brand-icon"><Layers3 aria-hidden="true"/></span><span>AP <span>Count</span></span></div><div className="top-actions"><span className="private-tag"><ShieldCheck aria-hidden="true"/>{t.private}</span><div className="language" role="group" aria-label={t.language}><button className={language==='en'?'active':''} onClick={()=>setLanguage('en')} aria-pressed={language==='en'}>EN</button><button className={language==='zh'?'active':''} onClick={()=>setLanguage('zh')} aria-pressed={language==='zh'}>中文</button></div></div></header>
    <main>
      <div className="intro"><div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.subtitle}</p></div><div className="intro-actions"><button className="ghost" onClick={()=>guideRef.current?.scrollIntoView({behavior:'smooth'})}><CircleHelp/>{t.guide}</button><button onClick={()=>setEditor(true)}><Settings2/>{t.portfolios}</button></div></div>
      {error?<div className="notice error" role="alert"><TriangleAlert/><div>{t[error.key]}{error.detail?<small>{error.detail}<br/>{t.fileReadDetail}</small>:null}</div><button className="ghost" onClick={()=>setError(null)} aria-label={t.clearNotice}><X/></button></div>:null}
      {notice?<div className={`notice ${notice==='saved'?'success':''}`} role="status"><Info/><div>{t[notice]}</div><button className="ghost" onClick={()=>setNotice(null)} aria-label={t.clearNotice}><X/></button></div>:null}
      <div className="workspace">
        <aside className="left-column">
          <section className="panel"><div className="panel-body"><div className="panel-heading"><div className="panel-title"><FileSpreadsheet/><h2>{t.importTitle}</h2></div><span className="step">01</span></div>
            <label className={`drop-zone ${dragging?'dragging':''}`} onDragOver={event=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(event.dataTransfer.files.length!==1)setError({key:'onlyOne'});else void loadFile(event.dataTransfer.files[0])}}>
              <input ref={fileInput} className="hidden-input" type="file" accept=".xls,.xlsx,.csv" aria-label={t.browse} onChange={event=>{void loadFile(event.target.files?.[0]);event.target.value=''}}/>
              <span className="upload-illustration">{busy?<LoaderCircle className="spinner"/>:<Upload/>}</span><strong>{busy?t.loading:t.drop}</strong><p>{t.dropSub}</p><span className="browse">{t.browse}<ArrowRight size={13}/></span><div className="file-types"><span>.XLS</span><span>.XLSX</span><span>.CSV</span></div>
            </label>
            <p className="upload-note"><LockKeyhole/>{t.privacy}</p>
            {filename?<div className="file-card"><FileSpreadsheet/><div><strong>{filename}</strong><small>{isDemo?t.demoBadge:`${fileSize<1024?`${fileSize} B`:`${Math.round(fileSize/1024)} KB`}`} · {t.fileLimit}</small></div><button className="icon-button ghost" onClick={removeFile} aria-label={t.reset}><X/></button></div>:null}
            {workbook?<div className="mapping"><div className="mapping-duo"><label className="field">{t.workbook}<select value={sheetIndex} onChange={event=>changeSheet(Number(event.target.value))}>{workbook.sheets.map((sheet,i)=><option key={`${sheet.name}-${i}`} value={i}>{sheet.name}</option>)}</select></label><label className="field">{t.header}<input type="number" min={1} max={sheet?.rows.length||1} value={headerRow+1} onChange={event=>changeHeader(event.target.value)}/></label></div><label className="field">{t.company}<select value={companyColumn} onChange={event=>{setCompanyColumn(Number(event.target.value));setPage(0);setUnknownPage(0)}}><option value={-1}>{t.chooseColumn}</option>{dataset?.headers.map((header,i)=><option key={i} value={i}>{header}</option>)}</select></label><p className="count-note">{dataset?`${formatted(dataset.rows.length)} ${t.rows} · ${dataset.skippedBlankRows} ${t.blankRows}`:t.badHeader}<br/>{t.countScope}</p></div>:<><div className="divider-text">{t.or}</div><button className="demo-button" onClick={()=>{loadId.current++;setBusy(false);selectWorkbook(demo,t.demoName,0,true)}}><BarChart3/>{t.demo}</button></>}
          </div></section>
          <section className="panel portfolio-panel"><div className="panel-body"><div className="panel-heading"><div className="panel-title"><Users/><h2>{t.rulesTitle}</h2></div><span className="step">02</span></div><div className="rules-summary"><span>{t.activeClerks}</span><strong>{rules.length}</strong></div><div className="rules-summary"><span>{t.distribution}</span><strong>{isDefault?t.defaultRules:t.customRules}</strong></div><p className="rule-info">{t.rulesNote}</p><button className="full-width" onClick={()=>setEditor(true)}><Settings2/>{t.editRules}</button></div></section>
        </aside>
        <div className="results" aria-busy={busy}>
          <div className="metrics">{metricLabels.map((label,i)=>{const Icon=metricIcons[i];return <div className="panel metric" key={i}><div className="metric-label"><span>{label}</span><Icon aria-hidden="true"/></div><p className={`metric-value ${metricValues[i]===undefined?'muted':i===0?'blue':i===3&&(metricValues[i]??0)>0?'amber':''}`} data-testid={`metric-${i}`}>{metricValues[i]===undefined?'—':formatted(metricValues[i]!)}</p><p className="metric-foot">{metricFoots[i]}</p></div>})}</div>
          <section className="panel" aria-labelledby="results-title"><div className="results-header"><h2 id="results-title"><BarChart3/>{t.resultTitle}</h2><span className={`result-status ${result?'ready':''}`} role="status"><span className="status-dot"/>{result?t.ready:t.awaiting}</span></div>
            {result?<>
              <div className="tabs" role="tablist" aria-label={t.resultTitle}>{(['clerks','projects','unknown'] as Tab[]).map((key,i)=><button key={key} role="tab" id={`tab-${key}`} aria-controls={`panel-${key}`} aria-selected={tab===key} tabIndex={tab===key?0:-1} className={tab===key?'active':''} onClick={()=>setTab(key)} onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const keys:Tab[]=['clerks','projects','unknown'];const next=keys[(i+(event.key==='ArrowRight'?1:2))%3];setTab(next);document.getElementById(`tab-${next}`)?.focus()}}}>{key==='clerks'?t.byClerk:key==='projects'?t.byProject:t.review}<span className="badge">{key==='clerks'?rules.length:key==='projects'?result.projects.length:result.unknown.length}</span></button>)}</div>
              <div className="results-inner" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
                {tab==='clerks'?<><div className="ap-list">{result.clerks.map(clerk=><div className="ap-row" key={clerk.id??'unknown'}><div className="ap-person"><span className="avatar">{clerk.id?clerk.ap.split(/\s+/).map(word=>word[0]).slice(0,2).join(''):'?'}</span><span>{clerk.id?clerk.ap:t.unknownCount}</span></div><div className="bar-track"><div className={`bar-fill ${clerk.id===null?'unknown':''}`} style={{width:`${clerk.share*100}%`}}/></div><span className="ap-number">{formatted(clerk.invoiceCount)}</span><span className="ap-percentage">{(clerk.share*100).toFixed(1)}%</span></div>)}</div><div className="export-line"><span>{t.exportNote}</span><button className="text-button" onClick={()=>download(apCountsCsv(result),'invoices_per_ap.csv')}><ArrowDownToLine/>{t.exportAp}</button></div></>:null}
                {tab==='projects'?<><div className="table-tools"><label className="search-box"><Search/><input value={search} onChange={event=>{setSearch(event.target.value);setPage(0)}} placeholder={t.search} aria-label={t.search}/></label><button className="small" onClick={()=>download(projectCountsCsv(result),'invoices_per_project.csv')}><ArrowDownToLine/>{t.exportProject}</button></div><div className="table-wrap"><table><thead><tr><th scope="col"><button onClick={()=>flipSort('projectNumber')}>{t.project}<ArrowDownUp/></button></th><th scope="col">{t.ap}</th><th scope="col" className="align-right"><button onClick={()=>flipSort('invoiceCount')}>{t.invoices}<ArrowDownUp/></button></th></tr></thead><tbody>{filteredProjects.slice(displayPage*PAGE_SIZE,(displayPage+1)*PAGE_SIZE).map(row=><tr key={row.projectNumber??'unknown'}><td>{rowName(row)}</td><td className={row.ap==='Unknown'?'unknown-cell':''}>{row.ap==='Unknown'?t.unknownCount:row.ap}</td><td className="align-right">{formatted(row.invoiceCount)}</td></tr>)}{filteredProjects.length===0?<tr><td colSpan={3}>{t.noMatches}</td></tr>:null}</tbody></table></div><div className="pagination"><span>{t.rowsShown} {filteredProjects.length?displayPage*PAGE_SIZE+1:0}–{Math.min((displayPage+1)*PAGE_SIZE,filteredProjects.length)} / {formatted(filteredProjects.length)}</span><div className="pagination-controls"><button disabled={displayPage===0} onClick={()=>setPage(displayPage-1)} aria-label={t.previous}><ChevronLeft/></button><span>{displayPage+1} / {maxPage+1}</span><button disabled={displayPage>=maxPage} onClick={()=>setPage(displayPage+1)} aria-label={t.next}><ChevronRight/></button></div></div></>:null}
                {tab==='unknown'?result.unknown.length?<><p className="section-note">{t.unknownNote}</p><div className="table-tools"><span className="subtle-label">{result.unknown.length} {t.rows}</span><button className="small" onClick={()=>download(unknownRowsCsv(result,dataset!.headers),'unknown_invoices.csv')}><ArrowDownToLine/>{t.exportUnknown}</button></div><div className="table-wrap unknown-table"><table><thead><tr><th scope="col">{t.sourceRow}</th><th scope="col">{t.project}</th><th scope="col">{t.reason}</th>{dataset?.headers.map((header,i)=><th scope="col" key={i}>{header}</th>)}</tr></thead><tbody>{result.unknown.slice(displayUnknownPage*PAGE_SIZE,(displayUnknownPage+1)*PAGE_SIZE).map(row=><tr key={row.sourceRow}><td>{row.sourceRow}</td><td>{row.projectNumber??'—'}</td><td>{row.reason==='missing-project'?t.missingProject:t.unassignedProject}</td>{dataset?.headers.map((_,i)=><td key={i} title={row.values[i]??''}>{row.values[i]||'—'}</td>)}</tr>)}</tbody></table></div><div className="pagination"><span>{t.rowsShown} {displayUnknownPage*PAGE_SIZE+1}–{Math.min((displayUnknownPage+1)*PAGE_SIZE,result.unknown.length)} / {result.unknown.length}</span><div className="pagination-controls"><button disabled={displayUnknownPage===0} onClick={()=>setUnknownPage(displayUnknownPage-1)} aria-label={t.previous}><ChevronLeft/></button><span>{displayUnknownPage+1} / {unknownMaxPage+1}</span><button disabled={displayUnknownPage>=unknownMaxPage} onClick={()=>setUnknownPage(displayUnknownPage+1)} aria-label={t.next}><ChevronRight/></button></div></div></>:<div className="unknown-ok"><CheckCircle2/>{t.allAssigned}</div>:null}
              </div>
            </>:<div className="empty-state"><div className="empty-icon"><BarChart3/></div><h3>{workbook?t.companyNone:t.emptyTitle}</h3><p>{workbook?(dataset?t.columnNote:t.badHeader):t.emptyText}</p><div className="empty-placeholder" aria-hidden="true"><span/><span/><span/><span/><span/></div></div>}
          </section>
          {result&&result.totalInvoices===0?<div className="notice"><Info/><div>{t.noRows}</div></div>:null}
          {workbook?.warnings.length?<div className="notice"><Info/><div><strong>{t.warnings}</strong>{workbook.warnings.map((warning,i)=><small key={i}>{warning}</small>)}</div></div>:null}
          <section className="panel method-card"><Info/><div><h3>{t.countMethod}</h3><p>{t.method}</p></div></section>
        </div>
      </div>
      <div className="bottom-guide" ref={guideRef}>{[1,2,3].map((number,i)=><div className="guide-item" key={number}><span className="guide-number">0{number}</span><div><h3>{[t.step1,t.step2,t.step3][i]}</h3><p>{[t.step1Text,t.step2Text,t.step3Text][i]}</p></div></div>)}</div>
    </main>
    <footer className="footer"><span>{t.footer}</span><span>{language==='en'?'Personal demo · ': '个人演示 · '}<ShieldCheck/>{t.localOnly}</span></footer>
    {editor?<PortfolioEditor rules={rules} language={language} onClose={()=>setEditor(false)} onSave={saveRules}/>:null}
  </div>
}
