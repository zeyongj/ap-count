# AP Count

A browser-local workspace for counting invoices by **AP clerk** and **project**. Import an `.xls`, `.xlsx`, or UTF-8 `.csv`, review the totals, update AP portfolios, and download the results. The interface starts in English and can switch to 中文.

**Source:** [github.com/zeyongj/ap-count](https://github.com/zeyongj/ap-count)

This deployment is a **personal, non-commercial demonstration**. Vercel's free [Hobby plan](https://vercel.com/docs/plans/hobby) is restricted to personal, non-commercial use. Company production use needs hosting with suitable terms. The app uses no paid API, database, authentication service, or custom domain. Hosting remains subject to the provider's free-plan terms and limits.

## Use the workspace

1. Choose or drop one invoice file. The included demo uses synthetic records, never the original invoice attachment.
2. Check the worksheet, header row, and **Company** column. A `Company` header is detected automatically, ignoring case and surrounding whitespace. For reports with a preamble or a differently named column, select the correct values yourself. Each analysis covers one selected worksheet.
3. Review the invoice total, AP clerk counts, project counts, and Unknown records. Search and sort the project list as needed.
4. Download `invoices_per_project.csv` and `invoices_per_ap.csv`. Unknown records can also be downloaded with their original columns and source row numbers for review.
5. Open the portfolio editor when assignments change. Save the edited rules to recalculate the current file immediately.

### Counting rules

- **One nonblank data row counts as one invoice**, matching the supplied Python's row-counting approach. Repeated invoice numbers and duplicate rows count again; no automatic deduplication occurs.
- The selected header row and rows above it are excluded. Completely blank data rows are skipped. Nonblank totals, footers, or notes below the header count as records, so remove them from the source if they are not invoices.
- The project number comes from the selected Company column: use the first bracketed digit group such as `[5419]`; otherwise use the first digit group anywhere in the value. A missing or unparseable project remains Unknown.
- The original Python's seven AP portfolios, all exceptions, and intentional gaps are preserved. For example, projects **5217** and **5338** remain Unknown with the default rules.
- Python evaluates the AP conditions in order: **5255 and 5266 belong to Jason Jin**, because his range matches before Steven's explicit include condition is reached. The default configuration removes these two unreachable Steven inclusions so that the compiled, order-independent rules reproduce Python's actual output. This normalization changes no assignment.
- Projects without a matching portfolio are assigned to **Unknown**, never silently discarded. Project counts include a blank-project bucket for records with no parsed number. The project metric counts only known project numbers.
- AP counts include configured clerks with zero invoices. This makes an empty portfolio visible; the original Python's `value_counts()` omitted zero-count clerks. Positive counts and the grand total are unchanged.
- CSV count headers are `ProjectNumber,InvoiceCount` and `AP,InvoiceCount`. Unknown export also includes original source fields, `SourceRow`, parsed project, AP, and reason. CSV files use UTF-8 with a BOM for Excel, RFC 4180 quoting, and formula-injection protection for text cells.

### Update AP portfolios

Each clerk has a name, project ranges, explicit included projects, and excluded projects.

- Enter **From = 5006** and **To = 5216** for an inclusive range. For `5791+`, enter **From = 5791** and leave **To** empty. Set both fields to `5200` for one project. Choose **Add range** for another interval.
- Separate included/excluded project IDs with commas, spaces, or newlines. All project IDs must be nonnegative safe whole numbers.
- **Explicit included projects take priority over ranges.** To transfer one project, remove any previous explicit inclusion and add it to the new clerk's included list. You do not need to split the original clerk's range.
- An exclusion removes a project from that clerk's ranges. A project cannot appear in both include and exclude for the same clerk.
- Conflicting explicit ownership, overlapping effective ranges, duplicate clerk names, and malformed values block saving. Uncovered projects are permitted and appear as Unknown.

Portfolio edits are saved **only in the current browser**. They are not synchronized between users or computers. Export the portfolio JSON and import it elsewhere to share a distribution; invoice records are not included. Keep a JSON backup before clearing browser data. Restoring defaults replaces your local distribution.

To change the defaults supplied to all new visitors, update `src/lib/default-rules.ts`, commit and push the change, and deploy it. Existing browser-saved rules remain local until users restore defaults or import the new rules.

## Privacy and supported files

All parsing and counting run in the browser. Invoice files and analyzed rows are held in memory and are not sent to an application server or stored in browser storage. Only portfolio settings are retained locally. Reloading/clearing the workspace removes the loaded invoice data. The hosting provider still serves the application's static files and may record normal web-request metadata.

The parser supports genuine legacy Excel `.xls`, modern `.xlsx`, and UTF-8 `.csv`. CSV decoding replaces invalid UTF-8 bytes and displays a warning; check the Company column if a warning appears. Formula cells are read as cached/displayed values and are never executed by the app. Password-protected or corrupted workbooks are not supported.

Browser processing limits: **25 MB per file, 250,000 worksheet rows including headers, 1,000 columns, and 100 worksheets**. Workbooks can expand substantially in memory, so split very large reports into smaller files. Only one selected worksheet is analyzed at a time; multiple sheets are not automatically combined.

No real invoice data is included in this public repository. Spreadsheet/CSV attachments, secrets, build output, and Vercel-local settings are ignored by Git. Test fixtures are synthetic.

## Development

Requires Node.js **22.12 or newer**.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

Use `npm run verify:attachments -- /absolute/path/to/ap.xls /absolute/path/to/ap.csv` to compare local source files without committing them. The optional script reads files locally; use synthetic fixtures in CI.

The stack is React, TypeScript, Vite, Lucide icons, and SheetJS Community Edition. SheetJS is pinned to the official `0.20.3` distribution because the package named `xlsx` on the npm registry is outdated. The lockfile fixes the full dependency tree for reproducible builds.

### Structure and algorithm

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Upload, bilingual interface, results, portfolio settings |
| `src/styles.css` | Responsive layout and visual styles |
| `src/lib/parse.ts` | File parsing, worksheet/header preparation, editor text validation |
| `src/lib/analysis.ts` | Rule validation/compilation, aggregation, safe CSV exports |
| `src/lib/default-rules.ts` | Original AP assignment rules |
| `src/lib/types.ts` | Shared typed contracts |
| `tests/` | Synthetic parsing, rule, boundary, and export regression tests |
| `scripts/verify-attachments.ts` | Optional local attachment comparison |

Rules are compiled once per analysis into an explicit-project lookup and sorted disjoint ranges. Explicit projects use map lookup; ranges use binary search. Counts are accumulated in maps in the same row pass. This preserves the original default assignments while avoiding repeated scans of the invoice table for each clerk or project. Conflicts are rejected before a distribution is applied.

### Deploy to Vercel

Import this repository into a Vercel account with suitable plan terms. Framework: **Vite**; install: `npm ci`; build: `npm run build`; output: `dist`. These values are included in `vercel.json`. No environment variables are required. Git integration can deploy `main` automatically.

GitHub Actions runs the tests and production build on pushes to `main` and pull requests. No deployment secrets are needed for that validation workflow. Invoice files must not be added to commits or CI artifacts.

## 中文说明

AP Count 用于按 **AP clerk** 与 **project** 统计 invoice 数量。支持上传 `.xls`、`.xlsx` 和 UTF-8 `.csv`，页面默认英文，可切换中文。所有数据处理都在浏览器中完成，不需要付费 API 或数据库。

### 使用步骤

1. 上传或拖入一个文件。演示数据均为合成记录，不包含真实附件。
2. 核对工作表、表头行以及 Company 列。系统会自动识别 Company 表头；文件有标题行或列名不同时，可以手动调整。
3. 查看总数、各 AP 数量、各 project 数量及 Unknown 明细。一次只统计一个工作表，不会自动合并多个工作表。
4. 分别下载 `invoices_per_project.csv`、`invoices_per_ap.csv`。Unknown 明细也可下载，并保留原始列与源文件行号。
5. 在 portfolio 编辑器中修改分配规则并保存，当前文件会立即按新规则重新统计。

### 统计口径

**每一条非空数据行计一张 invoice，不自动去重。** 表头及上方内容不计数，完全空白行跳过；表头下方非空的汇总行、备注和页脚仍会计数，请先从源文件移除不应统计的内容。

从 Company 文本中优先提取 `[5419]` 形式的第一个括号数字，否则提取第一个数字串。未能提取项目号，或项目号没有对应 AP，均归入 Unknown，数据不会被丢弃。默认分配与提供的 Python 一致，包括所有例外项目和未分配的间隙，例如 5217、5338。页面也会显示数量为零的 AP，方便检查 portfolio。

原 Python 按条件顺序判断：**5255、5266 实际归 Jason Jin**，因为先命中了 Jason 的范围，后面的 Steven 包含列表不会再执行。默认配置因此从 Steven 列表移除了这两项不可达规则，使新的规则引擎保留原 Python 的实际结果。

### 修改与共享 portfolio

每位 AP 可设置姓名、项目范围、明确包含项目和排除项目。例如，起始填 `5006`、截止填 `5216`，表示包含两端的范围；起始填 `5791`、截止留空，表示 `5791+`。单个项目可在起始、截止都填 `5200`。点击“添加范围”可设置另一段范围；明确包含/排除的项目列表可用逗号、空格或换行分隔。

**明确包含的项目优先于范围。** 转移单个项目时，将该项目加入新 AP 的包含列表；如果原 AP 也明确包含该项目，需要先移除原明确分配。同一个 AP 不能同时包含和排除同一个项目。冲突分配、有效范围重叠、重复姓名或无效输入会阻止保存；允许保留未分配项目，并在结果中显示为 Unknown。

修改仅保存在当前浏览器，不会自动同步给他人。可导出/导入规则 JSON 在不同电脑或用户之间共享，JSON 不含 invoice 数据。清除浏览器数据前请备份；恢复默认规则会替换本机规则。

如需修改所有新访客使用的默认规则，更新 `src/lib/default-rules.ts` 后提交到 GitHub 并重新部署。已有浏览器保存的规则仍需用户恢复默认或导入新版规则。

### 隐私、限制与免费部署

Invoice 文件和分析行只保留在页面内存中，不会上传到应用服务器，也不会写入浏览器本地存储；本地仅保存 portfolio 设置。刷新或清空工作区可移除已加载数据。静态托管平台仍可能记录普通网页请求信息。

单文件上限 25 MB、每工作表最多 250,000 行（含表头）和 1,000 列、每文件最多 100 个工作表。CSV 按 UTF-8 解码；如出现字符替换警告，请检查 Company 列。公式仅读取缓存/显示值，不执行公式。大文件建议先拆分。

当前 Vercel Hobby 发布版定位为**个人、非商业演示**。根据 [Vercel Hobby 条款](https://vercel.com/docs/plans/hobby)，公司正式生产使用需要符合用途的托管方案。项目未启用付费服务，但无法承诺托管服务条款或免费额度永久不变。

公共仓库不包含真实 invoice 数据。请勿将原始文件、密钥或包含真实数据的测试产物提交到 GitHub。
