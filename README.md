# AP Count

A workspace for counting invoices by **AP clerk** and **project**, using one shared cloud distribution for every visitor and computer. Import an `.xls`, `.xlsx`, or UTF-8 `.csv`, review the totals, and download the results. Invoice analysis stays in the browser; only an authorized administrator can update the shared portfolios. The interface starts in English and can switch to 中文.

**Source:** [github.com/zeyongj/ap-count](https://github.com/zeyongj/ap-count)

**Website:** [AP Count](https://ap-count.vercel.app/) · [Bilingual manual](https://ap-count.vercel.app/#manual)

The on-page **Manual / 使用手册** includes a quick start and expandable guides for uploads, counting rules, shared portfolios, ownership conflicts, downloads, troubleshooting, and privacy. Its EN/中文 controls use the same language setting as the rest of the page.

This deployment is a **personal, non-commercial demonstration**. Vercel's free [Hobby plan](https://vercel.com/docs/plans/hobby) is restricted to personal, non-commercial use. Company production use needs hosting with suitable terms. Authentication uses [Clerk Hobby](https://clerk.com/pricing), and the small shared configuration uses a private [Vercel Blob store](https://vercel.com/docs/vercel-blob/usage-and-pricing). These services have free allowances and usage limits; no paid upgrade is required for this demonstration. Provider terms, free allowances, and future availability can change.

## Use the workspace

1. Choose or drop one invoice file. The included demo uses synthetic records, never the original invoice attachment.
2. Check the worksheet, header row, and **Company** column. A `Company` header is detected automatically, ignoring case and surrounding whitespace. For reports with a preamble or a differently named column, select the correct values yourself. Each analysis covers one selected worksheet.
3. Review the invoice total, AP clerk counts, project counts, and Unknown records. Search and sort the project list as needed.
4. Download `invoices_per_project.csv` and `invoices_per_ap.csv`. Unknown records can also be downloaded with their original columns and source row numbers for review.
5. Anyone can read the shared distribution and use the counting tools without signing in. To change assignments, sign in as the authorized administrator, edit the portfolios, resolve any ownership conflicts, and save. A successful save updates the cloud distribution for everyone and recalculates the current file.

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
- **Every project must have at most one owner.** An included project does not silently override another clerk's range or inclusion. If two AP clerks claim a project, choose its owner in the conflict review. This also applies to overlapping ranges. The resolver adjusts the losing claims only for the displayed project or interval, preserving unrelated assignments.
- An exclusion removes a project from that clerk's ranges. A project cannot appear in both include and exclude for the same clerk.
- Unresolved ownership conflicts, duplicate clerk names, and malformed values block saving on both the client and server. Uncovered projects are permitted and appear as Unknown.

Portfolio edits are stored **in one shared cloud configuration**, not in an individual browser's localStorage. The page loads the latest distribution when opened and refreshes it when the page becomes active again. The last saved distribution remains in use until an administrator saves another change. Different computers visiting the same deployment read that same configuration. If the cloud service cannot be reached, the page reports the problem; browser-local rules are not treated as the shared authority.

Saving uses a revision check. If another administrator session saved first, the server rejects the stale save and the editor keeps your draft. Load the latest cloud version, review the differences, and reapply the intended changes before saving; a stale editor cannot silently overwrite a newer revision.

Export/import JSON is for configuration backup and restoration, not a separate personal distribution. An imported file or restored default first changes the administrator's draft; saving applies it to **all visitors**. Invoice rows are not included in rule backups. Existing browser-local rules from older versions are not automatically published to the cloud.

The initial fallback distribution is defined in `src/lib/default-rules.ts`. Once a cloud configuration exists, code changes to those defaults do not replace it. To update the live shared distribution, use the authenticated administrator editor.

### Administrator access

Sign-in and sessions use Clerk's managed components and SDK. The app does not implement a custom password database or password hashing scheme. The server validates the Clerk session, fetches the user's current identity, and allows writes only when the **verified primary email address** matches the server-side `AP_COUNT_ADMIN_EMAIL` allowlist value. A client-side role, typed email address, unverified address, or secondary email does not grant edit permission.

Normal visitors have read-only access to the shared rules. Administrator status is checked by the server for every save. The allowlisted address and authentication/storage credentials belong in deployment environment variables, never in committed files or browser code. Changing the administrator requires updating the server environment and deploying the change.

## Privacy and supported files

All invoice parsing and counting run in the browser. Invoice files and analyzed rows are held in memory and are not sent to the application API or stored in browser storage. Reloading/clearing the workspace removes the loaded invoice data. The cloud stores AP rules, a revision, and the last update time. AP names and assignment rules are readable by every visitor; do not put confidential invoice details in rule names or configuration files. Clerk handles administrator authentication and session data. Hosting, authentication, and storage providers may record normal service-request metadata.

The parser supports genuine legacy Excel `.xls`, modern `.xlsx`, and UTF-8 `.csv`. CSV decoding replaces invalid UTF-8 bytes and displays a warning; check the Company column if a warning appears. Formula cells are read as cached/displayed values and are never executed by the app. Password-protected or corrupted workbooks are not supported.

Browser processing limits: **25 MB per file, 250,000 worksheet rows including headers, 1,000 columns, and 100 worksheets**. Workbooks can expand substantially in memory, so split very large reports into smaller files. Only one selected worksheet is analyzed at a time; multiple sheets are not automatically combined.

No real invoice data is included in this public repository. Spreadsheet/CSV attachments, secrets, build output, and Vercel-local settings are ignored by Git. Test fixtures are synthetic.

## Development

Requires Node.js **22.12+ or 24 LTS** (below 25). Production uses Node 24; CI also verifies Node 22 compatibility.

```sh
npm ci
vercel link
vercel env pull .env.local --environment=development
vercel dev --listen 4173
```

Link to the intended Vercel project before pulling environment variables. Use the separate **development** private Blob store and development authentication configuration; do not connect local testing or preview work to the production store. `vercel dev` serves the frontend together with `/api/portfolio` and `/api/admin`. Plain `npm run dev` or `npm run preview` serves only the frontend and is insufficient for the complete shared-configuration workflow.

```sh
npm test
npm run build
```

After a Vercel production build, run `npm run check:functions` to boot the emitted API modules and verify anonymous permissions. This checks Node ESM packaging as well as the source-level tests.

See `.env.example` for configuration names. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is intentionally public and is included in the frontend bundle. `CLERK_SECRET_KEY`, `AP_COUNT_ADMIN_EMAIL`, and Blob credentials are server-only. Never add a browser-exposed `VITE_` or `NEXT_PUBLIC_` prefix to a secret. Blob authentication supports the managed `BLOB_READ_WRITE_TOKEN`, or a `BLOB_STORE_ID` with Vercel OIDC authentication. Retain generated credentials only in ignored environment files or Vercel environment settings. Do not print secrets in logs, commit `.env.local`, or publish downloaded environment files as artifacts.

Use `npm run verify:attachments -- /absolute/path/to/ap.xls /absolute/path/to/ap.csv` to compare local source files without committing them. The optional script reads files locally; use synthetic fixtures in CI.

The stack is React, TypeScript, Vite, Lucide icons, SheetJS Community Edition, Clerk's managed authentication SDKs, Vercel Functions, and private Vercel Blob storage. SheetJS is pinned to the official `0.20.3` distribution because the package named `xlsx` on the npm registry is outdated. The lockfile fixes the full dependency tree for reproducible builds.

### Structure and algorithm

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Upload, bilingual interface, results, portfolio settings |
| `src/styles.css` | Responsive layout and visual styles |
| `src/lib/parse.ts` | File parsing, worksheet/header preparation, editor text validation |
| `src/lib/analysis.ts` | Rule validation/compilation, aggregation, safe CSV exports |
| `src/lib/conflicts.ts` | Find ambiguous project ownership and resolve confirmed ownership choices |
| `src/lib/default-rules.ts` | Original AP assignment rules |
| `src/lib/types.ts` | Shared typed contracts |
| `api/portfolio.ts` | Public shared-rule reads and authenticated revision-checked writes |
| `api/admin.ts` | Server-verified administrator access check |
| `server/admin.ts` | Clerk session validation and verified-primary-email authorization |
| `server/blob-store.ts` | Private cloud storage and conditional writes |
| `server/portfolio.ts` | Shared schema, bounded requests, server-side validation, revision checks |
| `tests/` | Synthetic parsing, rule, boundary, and export regression tests |
| `scripts/verify-attachments.ts` | Optional local attachment comparison |

Rules are compiled once per analysis into an explicit-project lookup and sorted disjoint ranges. Explicit projects use map lookup; ranges use binary search. Counts are accumulated in maps in the same row pass. This preserves the original default assignments while avoiding repeated scans of the invoice table for each clerk or project. Conflicts are detected across all claims before a distribution is applied, including inclusion-versus-range conflicts; their resolution requires an explicit ownership choice.

### Deploy to Vercel

Import this repository into a Vercel account with suitable plan terms. Framework: **Vite**; install: `npm ci`; build: `npm run build`; output: `dist`. These values are included in `vercel.json`. Connect Clerk, configure its public/server keys and the server-side administrator allowlist, and attach a **private** Vercel Blob store. Keep production and development/preview storage separate. Git integration can deploy `main` automatically.

The current personal demo uses the Clerk development instance provisioned by Marketplace. For a production Clerk instance, complete its production-domain/DNS setup. No paid authentication add-ons are enabled.

The API requires environment configuration; a static-only copy cannot save shared rules. Shared reads use no-store responses. Writes require a verified administrator session, strict rule validation, and an unchanged cloud revision; conditional Blob writes enforce the revision even when saves arrive concurrently. Do not change these safeguards to make an unauthorized or stale save succeed.

GitHub Actions runs the tests and production build on pushes to `main` and pull requests. No deployment secrets are needed for that validation workflow. Invoice files must not be added to commits or CI artifacts.

## 中文说明

AP Count 用于按 **AP clerk** 与 **project** 统计 invoice 数量。支持上传 `.xls`、`.xlsx` 和 UTF-8 `.csv`，页面默认英文，可切换中文。Invoice 解析与统计在浏览器中完成；AP 项目分配保存在一份所有访客共用的云端配置中，只有授权管理员可以修改。

### 使用步骤

1. 上传或拖入一个文件。演示数据均为合成记录，不包含真实附件。
2. 核对工作表、表头行以及 Company 列。系统会自动识别 Company 表头；文件有标题行或列名不同时，可以手动调整。
3. 查看总数、各 AP 数量、各 project 数量及 Unknown 明细。一次只统计一个工作表，不会自动合并多个工作表。
4. 分别下载 `invoices_per_project.csv`、`invoices_per_ap.csv`。Unknown 明细也可下载，并保留原始列与源文件行号。
5. 普通访客无需登录即可查看共同分配规则、统计和下载。修改分配时，由授权管理员登录，在编辑器中修改并解决冲突后保存；成功保存会更新所有人的云端规则，并重新统计当前文件。

### 统计口径

**每一条非空数据行计一张 invoice，不自动去重。** 表头及上方内容不计数，完全空白行跳过；表头下方非空的汇总行、备注和页脚仍会计数，请先从源文件移除不应统计的内容。

从 Company 文本中优先提取 `[5419]` 形式的第一个括号数字，否则提取第一个数字串。未能提取项目号，或项目号没有对应 AP，均归入 Unknown，数据不会被丢弃。默认分配与提供的 Python 一致，包括所有例外项目和未分配的间隙，例如 5217、5338。页面也会显示数量为零的 AP，方便检查 portfolio。

原 Python 按条件顺序判断：**5255、5266 实际归 Jason Jin**，因为先命中了 Jason 的范围，后面的 Steven 包含列表不会再执行。默认配置因此从 Steven 列表移除了这两项不可达规则，使新的规则引擎保留原 Python 的实际结果。

### 修改与共享 portfolio

每位 AP 可设置姓名、项目范围、明确包含项目和排除项目。例如，起始填 `5006`、截止填 `5216`，表示包含两端的范围；起始填 `5791`、截止留空，表示 `5791+`。单个项目可在起始、截止都填 `5200`。点击“添加范围”可设置另一段范围；明确包含/排除的项目列表可用逗号、空格或换行分隔。

**每个项目最多只有一位负责人，不会静默覆盖。** 如果同一个项目同时被两位 AP 的明确包含或范围规则认领，必须在冲突提示中选择最终负责人；范围与范围重叠也同样处理。系统只调整提示中涉及的项目或区间，保留其他分配。同一个 AP 不能同时包含和排除同一个项目。未解决冲突、重复姓名或无效输入会同时被页面和服务器拒绝保存；允许保留未分配项目，并在结果中显示为 Unknown。

规则保存在**一份共同的云端配置**中，浏览器 localStorage 不再是分配规则的权威来源。每次打开页面会读取最新版本，返回页面时也会刷新；保存的版本持续有效，直到管理员再次保存修改。不同电脑访问同一个部署会读取同一份分配。云端服务不可用时，页面会提示错误，不会将本机旧规则当作共同规则发布。

保存会检查云端版本。如果另一个管理员会话已经先保存，新版本不会被旧草稿覆盖；当前草稿保留，请载入最新规则、核对并重新应用需要的修改。导入 JSON 或恢复默认规则先修改管理员草稿，点击保存后才会影响**所有访客**。规则备份不包含 invoice 数据，旧版浏览器本地规则也不会自动发布到云端。

`src/lib/default-rules.ts` 只提供尚无云端配置时的初始分配。已有云端配置后，修改代码中的默认值不会覆盖它；请通过管理员编辑器更新共同规则。

### 管理员权限

登录与会话交给 Clerk 的托管组件和 SDK，不使用自建密码数据库或自定义密码哈希。服务器验证 Clerk 会话并读取用户最新身份，只有**已验证的主要邮箱**与服务器环境变量 `AP_COUNT_ADMIN_EMAIL` 一致时，才允许保存。前端角色、手动输入邮箱、未验证邮箱或次要邮箱都不能授予权限；每次保存均由服务器重新检查。

管理员邮箱和认证／存储密钥只配置在服务器环境变量中，不应出现在公共代码、浏览器配置或文档中。普通访客只能读取共同规则。变更管理员时，请修改服务器环境配置并重新部署。

### 隐私、限制与免费部署

Invoice 文件和分析行只保留在页面内存中，不会上传到应用 API，也不会写入浏览器本地存储。刷新或清空工作区可移除已加载数据。云端只保存 AP 分配规则、版本和更新时间；所有访客都可读取 AP 姓名和分配，请勿将机密 invoice 内容写入规则。Clerk 负责管理员身份和会话，相关服务商仍可能记录正常服务请求信息。

单文件上限 25 MB、每工作表最多 250,000 行（含表头）和 1,000 列、每文件最多 100 个工作表。CSV 按 UTF-8 解码；如出现字符替换警告，请检查 Company 列。公式仅读取缓存/显示值，不执行公式。大文件建议先拆分。

当前 Vercel Hobby 发布版定位为**个人、非商业演示**。根据 [Vercel Hobby 条款](https://vercel.com/docs/plans/hobby)，公司正式生产使用需要符合用途的托管方案。认证采用 [Clerk Hobby](https://clerk.com/pricing)，配置采用私有 [Vercel Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing)；演示使用免费额度，无需付费升级，但额度、条款和未来可用性可能变化。

### 本地开发与环境变量

使用 Node.js 22.12+ 或 24 LTS。先运行 `npm ci`，将项目关联到正确的 Vercel 项目后，用 `vercel env pull .env.local --environment=development` 获取开发环境配置，再运行 `vercel dev --listen 4173`，同时提供页面与 API。单独运行 Vite 的 `npm run dev`／`npm run preview` 无法完成共同云端配置流程。开发和预览必须使用与正式环境分离的私有 Blob store，不要让测试写入正式配置。

变量名见 `.env.example`。`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 是可放入页面的公开标识；`CLERK_SECRET_KEY`、`AP_COUNT_ADMIN_EMAIL` 和 Blob 凭据只能留在服务器。不得给密钥加 `VITE_` 或 `NEXT_PUBLIC_` 前缀，也不要打印、提交或发布 `.env.local`。测试用 `npm test`，生产构建用 `npm run build`；本地附件核对命令见上方英文开发说明。

公共仓库不包含真实 invoice 数据。请勿将原始文件、密钥或包含真实数据的测试产物提交到 GitHub。
