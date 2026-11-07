import { BookOpen, ChevronDown } from "lucide-react";

type Language = "en" | "zh";

interface ManualTopic {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  note?: string;
}

interface ManualCopy {
  kicker: string;
  title: string;
  intro: string;
  quickStart: { title: string; text: string }[];
  topics: ManualTopic[];
}

const content: Record<Language, ManualCopy> = {
  en: {
    kicker: "REFERENCE",
    title: "Manual & documentation",
    intro:
      "Everything you need to count invoices, maintain the shared AP distribution, and review exceptions. Choose a topic below for more detail.",
    quickStart: [
      {
        title: "Upload",
        text: "Choose one invoice report and check its columns.",
      },
      {
        title: "Review",
        text: "Check AP counts, project counts, and Unknown rows.",
      },
      { title: "Download", text: "Export the full statistics as CSV files." },
    ],
    topics: [
      {
        id: "upload",
        title: "Upload a file and select its data",
        paragraphs: [
          "Drop an XLS, XLSX, or UTF-8 CSV file into the upload area, or choose Browse files. Try with demo data uses synthetic records.",
          "Select the worksheet, the row containing column headings, and the Company column. Company is detected automatically when possible; you can select a differently named column containing project text. Only the selected worksheet is counted.",
        ],
      },
      {
        id: "counting",
        title: "Understand the counting method",
        paragraphs: [
          "Each nonblank data row counts as one invoice. Duplicate rows and repeated invoice numbers count again. The header and rows above it are excluded; remove nonblank totals or footnotes below the header before importing.",
          "The first bracketed number, such as [5419], is the project number. If none exists, the first number in Company is used. AP counts include configured clerks with zero invoices; the Projects metric counts distinct project numbers and excludes missing numbers.",
          "New results appear with a brief animation. The interface respects your system’s Reduce motion preference; the animation does not change the calculations or exported data.",
        ],
      },
      {
        id: "distribution",
        title: "View or update the shared AP distribution",
        paragraphs: [
          "Everyone can view portfolios, count invoices, and download results without signing in. The Owner and authorized administrators can edit after signing in with a verified primary email.",
          "Choose Admin sign in, then Manage portfolios. Edit names, ranges, explicit assignments, or exclusions. Range ends are inclusive; leaving To empty means no upper limit. Save & recalculate publishes the distribution to everyone and updates your current counts.",
        ],
        note: "Saved rules remain active until the next administrator save. Other computers load them when opening the page; return to the page or choose Refresh shared rules to fetch the latest version.",
      },
      {
        id: "administrators",
        title: "Manage administrator access",
        paragraphs: [
          "The Owner manages access through Administration → Administrators. The Owner account is configured on the server and cannot be removed from this screen. Administrators can maintain the distribution, review rule history, and restore versions; they cannot grant or revoke administrator access.",
          "To add an administrator, ask the person to register through Admin sign in and verify their primary email first. Enter that exact email under Add administrator. The app checks the existing Clerk account and binds permission to its user ID and verified primary email. Adding permission does not create an account or send an invitation email.",
          "To remove an administrator, choose Revoke access and confirm. This removes their AP Count edit permission, without deleting their Clerk account. Permission changes are enforced by the server; refresh the page if the displayed controls have not updated.",
        ],
      },
      {
        id: "history",
        title: "Review rule history and restore a version",
        paragraphs: [
          "The Owner and administrators can open Administration → Rules history to review up to 100 recent rule versions. The oldest versions are removed sooner if storage capacity is reached. Each recorded save shows its version, server-recorded time, editor, and rule details. Starting snapshot preserves the distribution that existed before history was enabled; its earlier editor record may not be available. Older unrecorded edits cannot be recovered.",
          "Select a version, review its rules and changes, then choose Restore this version and confirm. Restoration publishes those rules for everyone as a new version and recalculates your loaded file. It does not restore old administrator permissions. Rule history remains subject to its version-count and storage-capacity limits.",
          "If another session changes the shared configuration first, the action is rejected. Refresh the management view, review the current state, and choose the intended action again. The app does not silently overwrite a newer configuration.",
        ],
        note: "History and editor identities are visible only to the Owner and administrators. Public visitors can read the active AP distribution, but cannot read history or manage access.",
      },
      {
        id: "conflicts",
        title: "Resolve conflicting project ownership",
        paragraphs: [
          "If two clerks claim the same project or overlapping range, the editor lists the candidates. Choose Assign to for the responsible AP. This also applies when an explicit assignment overlaps another clerk’s range; no owner is chosen automatically.",
          "Resolve every conflict and invalid field before saving. If another session saved newer rules, your draft is retained. Load the latest shared rules, review your changes, and save again. Replacing the draft discards its unsaved edits; export a valid draft first if you need a backup.",
        ],
      },
      {
        id: "downloads",
        title: "Download statistics and back up rules",
        paragraphs: [
          "Choose Download AP counts, Download project counts, or Download unknown rows in the corresponding tab. Exports include all results, regardless of search or pagination.",
        ],
        bullets: [
          "invoices_per_ap.csv — each AP clerk’s invoice count.",
          "invoices_per_project.csv — each project’s invoice count.",
          "unknown_invoices.csv — unassigned rows with original fields and source row numbers.",
          "Export rules downloads a JSON configuration backup, without invoice rows. An administrator can import it into a draft; saving publishes it to everyone.",
        ],
      },
      {
        id: "troubleshooting",
        title: "Review Unknown rows and common issues",
        paragraphs: [
          "Unknown means no project number was found, or no AP owns that project. Check its Company value and source row, then correct the source or ask the administrator to update the distribution. Unknown rows remain in the total.",
          "Empty results: check the worksheet, header, and Company selection. Character warning: re-export CSV as UTF-8. Shared rules unavailable: retry or refresh; a connection warning identifies a previously loaded version, and editing is paused until reconnecting. The app does not silently replace shared rules with browser-local defaults.",
        ],
      },
      {
        id: "privacy",
        title: "Privacy and supported limits",
        paragraphs: [
          "Invoice files and rows stay in browser memory and are not uploaded. Reloading removes the loaded invoice data. Cloud storage holds active AP rules, retained rule versions with editor identities and save times, and administrator permissions. Active rules are readable by every visitor; history is restricted to administrators, and the access list to the Owner. Administrator sign-in is handled by Clerk.",
          "Limits: 25 MB per file, 250,000 worksheet rows including headers, 1,000 columns, and 100 worksheets. Split large reports first. Password-protected or corrupted files are unsupported. This site remains a personal, non-commercial demo using free service allowances.",
        ],
      },
    ],
  },
  zh: {
    kicker: "使用指南",
    title: "使用手册与说明",
    intro:
      "了解如何统计发票、维护所有人共用的 AP 分配，以及处理未分配或冲突项目。展开下方主题查看详细步骤。",
    quickStart: [
      { title: "导入", text: "选择一份发票报表，核对工作表与数据列。" },
      { title: "核对", text: "查看 AP、项目统计及未分配明细。" },
      { title: "下载", text: "将完整统计结果导出为 CSV 文件。" },
    ],
    topics: [
      {
        id: "upload",
        title: "上传文件与选择数据",
        paragraphs: [
          "将 XLS、XLSX 或 UTF-8 CSV 文件拖入上传区，或点击“选择文件”。“试用演示数据”使用的是合成记录。",
          "选择工作表、包含列名的表头行，以及 Company 所在列。系统会尽量自动识别 Company；如果项目文字位于其他名称的列，可以手动选择。每次只统计选中的一个工作表。",
        ],
      },
      {
        id: "counting",
        title: "理解统计口径",
        paragraphs: [
          "每个非空数据行计一张发票，重复数据行或重复发票号也会再次计入。表头及其上方内容不计数；表头下方不应统计的非空汇总行、备注或页脚，请先从源文件移除。",
          "优先取第一个方括号数字（例如 [5419]）作为项目号；没有时，取 Company 中的第一个数字。AP 统计会显示数量为零的已配置人员；“项目数”统计不同项目编号，不包含缺少编号的数据行。",
          "新结果会带有简短动画。界面遵循系统的“减少动态效果”偏好；动画不会改变计算结果或导出的数据。",
        ],
      },
      {
        id: "distribution",
        title: "查看或修改共同的 AP 分配",
        paragraphs: [
          "所有访客无需登录即可查看分配、统计发票及下载结果。Owner 和获得授权的管理员可在使用已验证的主要邮箱登录后修改规则。",
          "点击“管理员登录”，再进入“管理 AP 分配”。可修改姓名、范围、明确分配及排除项目。范围包含起始和截止编号，截止留空表示无上限。点击“保存并重新统计”，会更新所有人共用的分配，并重新计算当前文件。",
        ],
        note: "保存的规则会持续生效，直到管理员再次保存。其他电脑打开网页时会读取同一份规则；返回页面或点击“刷新共享规则”可获取最新版本。",
      },
      {
        id: "administrators",
        title: "管理管理员权限",
        paragraphs: [
          "Owner 可通过“管理中心 → 管理员”维护权限。Owner 账户由服务器配置，无法在此界面移除。管理员可维护 AP 分配、查看规则历史及恢复版本，但不能添加或撤销其他管理员。",
          "添加前，请先让对方通过“管理员登录”注册并验证主要邮箱，再在“添加管理员”中输入该邮箱。系统会核对现有 Clerk 账户，并将权限绑定到用户 ID 和已验证的主要邮箱。添加权限不会创建账户，也不会发送邀请邮件。",
          "移除管理员时，点击“撤销权限”并确认。这只撤销其 AP Count 编辑权限，不会删除 Clerk 账户。每次操作都由服务器核对权限；如果页面按钮尚未更新，请刷新页面。",
        ],
      },
      {
        id: "history",
        title: "查看规则历史与恢复版本",
        paragraphs: [
          "Owner 和管理员可在“管理中心 → 规则历史”查看最多最近 100 个规则版本；存储容量达到上限时会提前移除最旧版本。每次记录包含版本、服务器记录的时间、操作者及规则详情。“起始快照”保留启用历史功能前的现有分配，当时的操作者可能无记录。此前未记录的修改无法追溯恢复。",
          "选择版本并核对规则与变更后，点击“恢复此版本”并确认。恢复会将该分配作为一个新版本发布给所有人，并重新统计当前文件；不会恢复旧的管理员权限。规则历史仍受版本数量和存储容量限制。",
          "若其他会话已先修改共同配置，当前操作会被拒绝。请刷新管理界面、核对最新状态，再重新选择需要执行的操作。系统不会静默覆盖较新的配置。",
        ],
        note: "历史和操作者身份仅供 Owner 与管理员查看。普通访客可以读取当前 AP 分配，但无法查看历史或管理权限。",
      },
      {
        id: "conflicts",
        title: "确认重复分配项目的负责人",
        paragraphs: [
          "当两位 AP 同时认领某个项目或重叠范围时，编辑器会列出候选人员。点击相应的“分配给”按钮，明确选择负责人。明确分配与另一人的范围重叠也需要确认，系统不会自行决定归属。",
          "解决所有冲突和无效输入后才能保存。若其他会话已经保存较新规则，当前草稿会保留；请载入最新共享规则，核对并重新应用需要的修改。替换草稿会丢弃未保存的编辑，如需保留，可先导出有效草稿备份。",
        ],
      },
      {
        id: "downloads",
        title: "下载统计与备份规则",
        paragraphs: [
          "在对应标签中点击“下载 AP 统计”“下载项目统计”或“下载未分配明细”。导出包含全部结果，不受搜索或当前分页影响。",
        ],
        bullets: [
          "invoices_per_ap.csv：每位 AP 的发票数。",
          "invoices_per_project.csv：每个项目的发票数。",
          "unknown_invoices.csv：未分配数据行，保留原始列及源文件行号。",
          "“导出规则”下载 JSON 配置备份，不包含发票行。管理员可导入至草稿；保存后才会更新所有人的分配。",
        ],
      },
      {
        id: "troubleshooting",
        title: "核对未分配数据与常见问题",
        paragraphs: [
          "Unknown／未分配表示没有找到项目号，或该项目尚无对应 AP。请检查 Company 内容及原始行号，修正源文件或由管理员调整分配。未分配数据仍计入发票总数。",
          "没有结果：核对工作表、表头行和 Company 列。字符警告：将 CSV 重新导出为 UTF-8。无法读取共享规则：重试或刷新；连接警告会说明当前显示的是已载入的旧版本，恢复连接前暂停编辑。系统不会用本机默认规则静默替换共享分配。",
        ],
      },
      {
        id: "privacy",
        title: "数据隐私与文件限制",
        paragraphs: [
          "发票文件及数据行仅保留在浏览器内存中，不会上传；刷新后需重新导入。云端保存当前 AP 规则、保留的规则版本及操作者身份和时间，以及管理员权限。当前规则可供所有访客读取；规则历史仅供管理员查看，权限名单仅供 Owner 查看。管理员登录由 Clerk 处理。",
          "限制：单文件 25 MB，每工作表最多 250,000 行（含表头）和 1,000 列，每文件最多 100 个工作表。大文件请先拆分，不支持加密或损坏文件。本网站继续作为个人、非商业演示，使用相关服务的免费额度。",
        ],
      },
    ],
  },
};

export default function Manual({ language }: { language: Language }) {
  const t = content[language];

  return (
    <section
      className="manual-section panel"
      id="manual"
      aria-labelledby="manual-title"
    >
      <header className="manual-header">
        <span className="manual-icon" aria-hidden="true">
          <BookOpen />
        </span>
        <div className="manual-heading-copy">
          <p className="manual-kicker">{t.kicker}</p>
          <h1 id="manual-title" tabIndex={-1}>
            {t.title}
          </h1>
          <p className="manual-intro">{t.intro}</p>
        </div>
      </header>

      <ol className="manual-quickstart">
        {t.quickStart.map((step, index) => (
          <li key={index}>
            <span className="manual-topic-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="manual-topics">
        {t.topics.map((topic, index) => (
          <details
            className="manual-topic"
            id={`manual-${topic.id}`}
            key={topic.id}
            open={index === 0}
          >
            <summary>
              <span className="manual-topic-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <strong>{topic.title}</strong>
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className="manual-topic-body">
              {topic.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}>{paragraph}</p>
              ))}
              {topic.bullets ? (
                <ul>
                  {topic.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
              {topic.note ? <p className="manual-note">{topic.note}</p> : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
