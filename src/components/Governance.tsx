import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { APPortfolio } from "../lib/types";
import type {
  Administrator,
  GovernanceAction,
  GovernanceSnapshot,
  RuleVersion,
} from "../lib/governance";
import "./governance.css";

type Language = "en" | "zh";
interface GovernanceProps {
  language: Language;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onRulesChanged: () => Promise<void>;
  onAccessChanged?: () => void;
}
type PendingAction =
  | { kind: "rollback"; version: RuleVersion }
  | { kind: "grant"; email: string }
  | { kind: "revoke"; administrator: Administrator };

const copy = {
  en: {
    title: "Administration",
    subtitle: "Maintain shared access and a traceable history of AP rules.",
    close: "Close administration",
    history: "Rules history",
    admins: "Administrators",
    loading: "Loading administration…",
    refresh: "Refresh",
    retry: "Retry",
    current: "Current",
    version: "Version",
    baseline: "Starting snapshot",
    save: "Rules saved",
    rollback: "Version restored",
    noActor: "Record not available",
    noDate: "Time not recorded",
    retention:
      "Up to {limit} recent rule versions are retained; the oldest versions are removed sooner if storage fills. Restoring creates a new version.",
    details: "Version details",
    changed: "Changed portfolios",
    before: "Before",
    after: "After",
    added: "Added",
    removed: "Removed",
    ranges: "Project ranges",
    include: "Explicit projects",
    exclude: "Excluded projects",
    none: "None",
    from: "Restored from",
    preview: "Rules in this version",
    initial:
      "This snapshot preserves the distribution in place when history was enabled. Earlier edits and authors were not recorded.",
    previousMissing:
      "The previous snapshot is outside the retained history. The full rules for this version are shown below.",
    noChanges: "No portfolio changes compared with the previous version.",
    restore: "Restore this version",
    restoreTitle: "Restore this rule version?",
    restoreText:
      "The selected rules will become the shared distribution for everyone. A new history entry records this restore. Administrator accounts and earlier history remain in place.",
    restoreConfirm: "Confirm restore",
    cancel: "Cancel",
    working: "Saving…",
    owner: "Owner",
    admin: "Admin",
    ownerNote:
      "The Owner manages administrator access and cannot be removed here.",
    addTitle: "Add administrator",
    addHelp:
      "Ask the person to sign up on AP Count and verify their primary email first. Enter that email to grant access. This does not create an account or send an invitation.",
    email: "Verified primary email",
    add: "Add administrator",
    addConfirm: "Grant administrator access?",
    addText:
      "This account will be able to change the shared AP rules, view rule history, and restore versions. Only the Owner can manage administrators.",
    confirmAdd: "Grant access",
    revoke: "Revoke access",
    revokeTitle: "Revoke administrator access?",
    revokeText:
      "This account will lose permission to edit shared rules and view history. Their sign-in account and existing rule history will remain.",
    confirmRevoke: "Revoke access",
    addedAt: "Access granted",
    addedBy: "Granted by",
    protectedOwner: "Protected Owner",
    noAdmins: "No additional administrators yet.",
    restoredSuccess:
      "The version was restored and the shared distribution was refreshed.",
    grantedSuccess: "Administrator access granted.",
    revokedSuccess: "Administrator access revoked.",
    refreshRequired:
      "Refresh the latest state before making another change. Your email entry is preserved.",
    refreshAfterSave:
      "The rules were restored. The main page could not refresh; close this window and refresh shared rules there.",
    unauthorized: "Your session has expired. Sign in again to continue.",
    forbidden: "This account no longer has permission for this operation.",
    revision_conflict:
      "Someone changed the shared configuration. Refresh and review the latest state before trying again.",
    account_not_found:
      "No registered account was found with this primary email. Ask the person to sign up first.",
    email_not_verified:
      "This account’s primary email is not verified. Ask them to verify it first.",
    already_admin: "This account already has administrator access.",
    owner_protected:
      "The Owner cannot be removed or added as an administrator.",
    admin_not_found: "This administrator no longer exists. Refresh the list.",
    version_not_found:
      "This version is no longer available. Refresh the history.",
    current_version: "This is already the current version.",
    admin_limit:
      "The administrator limit has been reached. Revoke unused access before adding another account.",
    payload_too_large:
      "The shared configuration has reached its size limit. Export a rules backup and contact the Owner.",
    service_unavailable:
      "The service could not confirm this operation. Refresh to check the latest state before retrying.",
    invalid_request:
      "Check the email address or selected version and try again.",
    invalid_rules:
      "The selected rules could not be restored because validation failed.",
    invalid_email: "Enter a valid email address.",
    generic: "Administration could not be loaded. Please retry.",
  },
  zh: {
    title: "管理中心",
    subtitle: "管理共享权限，并追溯 AP 分配规则的修改记录。",
    close: "关闭管理中心",
    history: "规则历史",
    admins: "管理员",
    loading: "正在载入管理中心…",
    refresh: "刷新",
    retry: "重试",
    current: "当前",
    version: "版本",
    baseline: "起始快照",
    save: "保存规则",
    rollback: "恢复版本",
    noActor: "无历史记录",
    noDate: "未记录时间",
    retention:
      "最多保留最近 {limit} 个规则版本；存储空间不足时会提前移除最旧版本。恢复操作会生成新版本。",
    details: "版本详情",
    changed: "有修改的 AP 分配",
    before: "修改前",
    after: "修改后",
    added: "新增",
    removed: "移除",
    ranges: "项目范围",
    include: "单独包含的项目",
    exclude: "排除的项目",
    none: "无",
    from: "恢复来源",
    preview: "此版本的完整规则",
    initial: "此快照保留启用历史功能时的分配。更早的修改过程及操作人没有记录。",
    previousMissing: "上一份快照已超出保留范围，下方仍可查看此版本的完整规则。",
    noChanges: "与上一版本相比，AP 分配没有变化。",
    restore: "恢复此版本",
    restoreTitle: "确认恢复此规则版本？",
    restoreText:
      "所选规则将成为所有人共用的 AP 分配，并新增一条恢复记录。管理员权限和已有历史不会被回滚。",
    restoreConfirm: "确认恢复",
    cancel: "取消",
    working: "正在保存…",
    owner: "Owner",
    admin: "管理员",
    ownerNote: "Owner 可管理其他管理员，不能在此处移除。",
    addTitle: "添加管理员",
    addHelp:
      "请先让对方在 AP Count 注册并验证主要邮箱，再输入该邮箱授予权限。此操作不会创建账户或发送邀请邮件。",
    email: "已验证的主要邮箱",
    add: "添加管理员",
    addConfirm: "确认授予管理员权限？",
    addText:
      "该账户将能修改共享 AP 分配、查看规则历史和恢复版本。只有 Owner 可以管理管理员。",
    confirmAdd: "授予权限",
    revoke: "撤销权限",
    revokeTitle: "确认撤销管理员权限？",
    revokeText:
      "该账户将失去修改共享规则和查看历史的权限，登录账户与已有规则历史仍保留。",
    confirmRevoke: "撤销权限",
    addedAt: "授权时间",
    addedBy: "授权人",
    protectedOwner: "受保护的 Owner",
    noAdmins: "尚未添加其他管理员。",
    restoredSuccess: "已恢复所选版本，并刷新共享 AP 分配。",
    grantedSuccess: "已授予管理员权限。",
    revokedSuccess: "已撤销管理员权限。",
    refreshRequired: "请先刷新并核对最新状态，再进行修改。已输入的邮箱会保留。",
    refreshAfterSave:
      "规则已恢复，但主页未能刷新。请关闭此窗口，在主页刷新共享规则。",
    unauthorized: "登录已过期，请重新登录后继续。",
    forbidden: "当前账户已无权执行此操作。",
    revision_conflict: "其他人已修改共享配置。请刷新并核对最新状态后再操作。",
    account_not_found: "没有找到以此邮箱为主要邮箱的注册账户，请先让对方注册。",
    email_not_verified: "该账户的主要邮箱尚未验证，请先完成验证。",
    already_admin: "该账户已经具有管理员权限。",
    owner_protected: "Owner 不能被移除或重复添加为管理员。",
    admin_not_found: "此管理员已不存在，请刷新列表。",
    version_not_found: "此版本已不再可用，请刷新历史。",
    current_version: "这已经是当前版本。",
    admin_limit: "管理员数量已达上限，请先撤销不再需要的权限。",
    payload_too_large: "共享配置已达大小限制，请先导出规则备份并联系 Owner。",
    service_unavailable: "服务未能确认本次操作，请先刷新核对最新状态后再重试。",
    invalid_request: "请核对邮箱或所选版本后重试。",
    invalid_rules: "所选规则未通过验证，无法恢复。",
    invalid_email: "请输入有效的邮箱地址。",
    generic: "无法载入管理中心，请重试。",
  },
};

class GovernanceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function isSnapshot(value: unknown): value is GovernanceSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<GovernanceSnapshot>;
  return (
    typeof data.revision === "string" &&
    (data.role === "owner" || data.role === "admin") &&
    Array.isArray(data.administrators) &&
    Array.isArray(data.history) &&
    typeof data.historyLimit === "number"
  );
}

function ruleSignature(rule: APPortfolio) {
  return JSON.stringify({
    name: rule.name,
    ranges: [...rule.ranges].sort(
      (a, b) => a.start - b.start || (a.end ?? Infinity) - (b.end ?? Infinity),
    ),
    include: [...rule.include].sort((a, b) => a - b),
    exclude: [...rule.exclude].sort((a, b) => a - b),
  });
}

function ruleChanges(previous: APPortfolio[], next: APPortfolio[]) {
  const oldRules = new Map(previous.map((rule) => [rule.id, rule]));
  const newRules = new Map(next.map((rule) => [rule.id, rule]));
  return [...new Set([...oldRules.keys(), ...newRules.keys()])].flatMap(
    (id) => {
      const before = oldRules.get(id);
      const after = newRules.get(id);
      return before && after && ruleSignature(before) === ruleSignature(after)
        ? []
        : [{ id, before, after }];
    },
  );
}

function RuleSummary({
  rule,
  language,
}: {
  rule: APPortfolio | undefined;
  language: Language;
}) {
  const t = copy[language];
  if (!rule) return <p className="governance-muted">{t.none}</p>;
  const ranges = rule.ranges.length
    ? rule.ranges
        .map((range) => `${range.start}–${range.end ?? "∞"}`)
        .join(", ")
    : t.none;
  return (
    <dl className="governance-rule-summary">
      <div>
        <dt>AP</dt>
        <dd>{rule.name}</dd>
      </div>
      <div>
        <dt>{t.ranges}</dt>
        <dd>{ranges}</dd>
      </div>
      <div>
        <dt>{t.include}</dt>
        <dd>{rule.include.join(", ") || t.none}</dd>
      </div>
      <div>
        <dt>{t.exclude}</dt>
        <dd>{rule.exclude.join(", ") || t.none}</dd>
      </div>
    </dl>
  );
}

export default function Governance({
  language,
  getToken,
  onClose,
  onRulesChanged,
  onAccessChanged,
}: GovernanceProps) {
  const t = copy[language];
  const [snapshot, setSnapshot] = useState<GovernanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [notice, setNotice] = useState<
    "restoredSuccess" | "grantedSuccess" | "revokedSuccess" | null
  >(null);
  const [tab, setTab] = useState<"history" | "administrators">("history");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const callbacks = useRef({ onClose, onRulesChanged, onAccessChanged });
  callbacks.current = { onClose, onRulesChanged, onAccessChanged };
  const requestId = useRef(0);

  const request = useCallback(
    async (
      action?: GovernanceAction,
      signal?: AbortSignal,
    ): Promise<GovernanceSnapshot> => {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const controller = new AbortController();
      let rejectInterrupted!: (reason: unknown) => void;
      const interrupted = new Promise<never>((_resolve, reject) => {
        rejectInterrupted = reject;
      });
      const abort = () => {
        controller.abort();
        rejectInterrupted(new DOMException("Aborted", "AbortError"));
      };
      const timeout = window.setTimeout(() => {
        controller.abort();
        rejectInterrupted(new GovernanceError("service_unavailable"));
      }, 20_000);
      signal?.addEventListener("abort", abort, { once: true });
      const operation = async () => {
        const token = await getToken();
        // A late token must never start a mutation after the caller timed out.
        if (controller.signal.aborted)
          throw new GovernanceError("service_unavailable");
        if (!token) throw new GovernanceError("unauthorized");
        const response = await fetch("/api/governance", {
          method: action ? "POST" : "GET",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(action ? { "Content-Type": "application/json" } : {}),
          },
          ...(action ? { body: JSON.stringify(action) } : {}),
          cache: "no-store",
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const code =
            result &&
            typeof result === "object" &&
            "code" in result &&
            typeof result.code === "string"
              ? result.code
              : "service_unavailable";
          throw new GovernanceError(code);
        }
        if (!isSnapshot(result))
          throw new GovernanceError("service_unavailable");
        return result;
      };
      try {
        return await Promise.race([operation(), interrupted]);
      } finally {
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    },
    [getToken],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (busyRef.current) return;
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const latest = await request(undefined, signal);
        if (!mounted.current || id !== requestId.current) return;
        setSnapshot(latest);
        setSelectedId((current) =>
          latest.history.some((version) => version.id === current)
            ? current
            : (latest.history[0]?.id ?? null),
        );
        setPending(null);
        setNeedsRefresh(false);
        if (latest.role !== "owner") setTab("history");
      } catch (failure) {
        if (!mounted.current || signal?.aborted || id !== requestId.current)
          return;
        const code =
          failure instanceof GovernanceError
            ? failure.code
            : "service_unavailable";
        setError(code);
        setNeedsRefresh(true);
        if (code === "unauthorized" || code === "forbidden") {
          setSnapshot(null);
          callbacks.current.onAccessChanged?.();
        }
      } finally {
        if (mounted.current && id === requestId.current && !signal?.aborted)
          setLoading(false);
      }
    },
    [request],
  );

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mounted.current = false;
      controller.abort();
      requestId.current++;
    };
  }, [load]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) callbacks.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = priorOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (pending) cancelRef.current?.focus();
  }, [pending]);

  const selected =
    snapshot?.history.find((version) => version.id === selectedId) ??
    snapshot?.history[0];
  const previous =
    snapshot && selected
      ? snapshot.history[
          snapshot.history.findIndex((version) => version.id === selected.id) +
            1
        ]
      : undefined;
  const changes = useMemo(
    () =>
      selected && previous
        ? ruleChanges(previous.portfolios, selected.portfolios)
        : [],
    [selected, previous],
  );

  function timestamp(value: string | null) {
    if (!value) return t.noDate;
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-CA", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date)
      : t.noDate;
  }
  function errorMessage(code: string) {
    return code === "refresh_after_save"
      ? t.refreshAfterSave
      : Object.hasOwn(t, code)
        ? t[code as keyof typeof t]
        : t.generic;
  }
  function actionLabel(version: RuleVersion) {
    return version.action === "baseline"
      ? t.baseline
      : version.action === "rollback"
        ? t.rollback
        : t.save;
  }

  async function confirmAction() {
    if (!snapshot || !pending || busyRef.current || needsRefresh || loading)
      return;
    const action: GovernanceAction =
      pending.kind === "rollback"
        ? {
            revision: snapshot.revision,
            action: "rollback",
            versionId: pending.version.id,
          }
        : pending.kind === "grant"
          ? {
              revision: snapshot.revision,
              action: "grant-admin",
              email: pending.email,
            }
          : {
              revision: snapshot.revision,
              action: "revoke-admin",
              userId: pending.administrator.userId!,
            };
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const latest = await request(action);
      if (!mounted.current) return;
      setSnapshot(latest);
      setPending(null);
      setNeedsRefresh(false);
      if (action.action === "rollback") {
        setSelectedId(latest.history[0]?.id ?? null);
        setNotice("restoredSuccess");
        try {
          await callbacks.current.onRulesChanged();
        } catch {
          if (mounted.current) setError("refresh_after_save");
        }
      } else {
        if (action.action === "grant-admin") setEmail("");
        setNotice(
          action.action === "grant-admin" ? "grantedSuccess" : "revokedSuccess",
        );
        callbacks.current.onAccessChanged?.();
      }
    } catch (failure) {
      if (!mounted.current) return;
      const code =
        failure instanceof GovernanceError
          ? failure.code
          : "service_unavailable";
      setError(code);
      if (
        [
          "revision_conflict",
          "service_unavailable",
          "admin_not_found",
          "version_not_found",
        ].includes(code)
      )
        setNeedsRefresh(true);
      if (code === "unauthorized" || code === "forbidden") {
        setNeedsRefresh(true);
        callbacks.current.onAccessChanged?.();
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop governance-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busyRef.current) onClose();
      }}
    >
      <div
        className="modal governance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="governance-title"
        aria-describedby="governance-description"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="modal-header governance-header">
          <div>
            <h2 id="governance-title">
              <ShieldCheck aria-hidden="true" />
              {t.title}
            </h2>
            <p id="governance-description">{t.subtitle}</p>
          </div>
          <button
            className="icon-button"
            ref={closeRef}
            aria-label={t.close}
            disabled={busy}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="governance-toolbar">
          <div className="governance-tabs" role="tablist" aria-label={t.title}>
            {(
              [
                "history",
                ...(snapshot?.role === "owner" ? ["administrators"] : []),
              ] as ("history" | "administrators")[]
            ).map((name, index, array) => (
              <button
                key={name}
                role="tab"
                id={`governance-tab-${name}`}
                aria-controls={`governance-panel-${name}`}
                aria-selected={tab === name}
                tabIndex={tab === name ? 0 : -1}
                disabled={busy}
                onClick={() => {
                  setTab(name);
                  setPending(null);
                }}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? array.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            array.length) %
                          array.length;
                  setTab(array[nextIndex]);
                  setPending(null);
                  document
                    .getElementById(`governance-tab-${array[nextIndex]}`)
                    ?.focus();
                }}
              >
                {name === "history" ? (
                  <History aria-hidden="true" />
                ) : (
                  <Users aria-hidden="true" />
                )}
                {name === "history" ? t.history : t.admins}
              </button>
            ))}
          </div>
          <button
            className="small"
            disabled={busy || loading}
            onClick={() => {
              setNotice(null);
              void load();
            }}
          >
            <RefreshCw
              className={loading ? "spinner" : undefined}
              aria-hidden="true"
            />
            {t.refresh}
          </button>
        </div>
        <div className="modal-body governance-body" aria-busy={busy || loading}>
          {error ? (
            <div className="notice error governance-message" role="alert">
              <span>
                {errorMessage(error)}
                {needsRefresh && snapshot ? (
                  <small>{t.refreshRequired}</small>
                ) : null}
              </span>
              {!snapshot ? (
                <button
                  className="small"
                  disabled={loading || busy}
                  onClick={() => void load()}
                >
                  {t.retry}
                </button>
              ) : null}
            </div>
          ) : null}
          {notice ? (
            <div className="governance-success" role="status">
              <CheckCircle2 aria-hidden="true" />
              {t[notice]}
            </div>
          ) : null}
          {pending ? (
            <section
              className="governance-confirm"
              aria-labelledby="governance-confirm-title"
            >
              <h3 id="governance-confirm-title">
                {pending.kind === "rollback"
                  ? t.restoreTitle
                  : pending.kind === "grant"
                    ? t.addConfirm
                    : t.revokeTitle}
              </h3>
              <p className="governance-confirm-target">
                {pending.kind === "rollback"
                  ? `${t.version} ${pending.version.number} · ${timestamp(pending.version.createdAt)}`
                  : pending.kind === "grant"
                    ? pending.email
                    : pending.administrator.email}
              </p>
              <p>
                {pending.kind === "rollback"
                  ? t.restoreText
                  : pending.kind === "grant"
                    ? t.addText
                    : t.revokeText}
              </p>
              <div>
                <button
                  className="primary"
                  disabled={busy || loading || needsRefresh}
                  onClick={() => void confirmAction()}
                >
                  {busy ? (
                    <LoaderCircle className="spinner" aria-hidden="true" />
                  ) : pending.kind === "rollback" ? (
                    <RotateCcw aria-hidden="true" />
                  ) : pending.kind === "grant" ? (
                    <UserPlus aria-hidden="true" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                  {busy
                    ? t.working
                    : pending.kind === "rollback"
                      ? t.restoreConfirm
                      : pending.kind === "grant"
                        ? t.confirmAdd
                        : t.confirmRevoke}
                </button>
                <button
                  ref={cancelRef}
                  disabled={busy}
                  onClick={() => setPending(null)}
                >
                  {t.cancel}
                </button>
              </div>
            </section>
          ) : null}
          {loading && !snapshot ? (
            <div className="governance-loading" role="status">
              <LoaderCircle className="spinner" aria-hidden="true" />
              {t.loading}
            </div>
          ) : null}
          {snapshot ? (
            <>
              <section
                role="tabpanel"
                id="governance-panel-history"
                aria-labelledby="governance-tab-history"
                hidden={tab !== "history"}
              >
                <p className="governance-help">
                  <Clock3 aria-hidden="true" />
                  {t.retention.replace(
                    "{limit}",
                    String(snapshot.historyLimit),
                  )}
                </p>
                <div className="governance-history-layout">
                  <div
                    className="governance-version-list"
                    aria-label={t.history}
                  >
                    {snapshot.history.map((version, index) => (
                      <button
                        key={version.id}
                        className={
                          selected?.id === version.id
                            ? "governance-version active"
                            : "governance-version"
                        }
                        aria-pressed={selected?.id === version.id}
                        disabled={busy}
                        onClick={() => {
                          setSelectedId(version.id);
                          setPending(null);
                          setNotice(null);
                        }}
                      >
                        <span className="governance-version-heading">
                          <strong>V{version.number}</strong>
                          {index === 0 ? (
                            <span className="governance-badge">
                              {t.current}
                            </span>
                          ) : null}
                          <ChevronRight aria-hidden="true" />
                        </span>
                        <span>{actionLabel(version)}</span>
                        <small>{timestamp(version.createdAt)}</small>
                        <small className="governance-email">
                          {version.actor?.email ?? t.noActor}
                        </small>
                      </button>
                    ))}
                  </div>
                  {selected ? (
                    <div className="governance-version-details">
                      <header>
                        <div>
                          <p className="governance-kicker">{t.details}</p>
                          <h3>
                            V{selected.number} · {actionLabel(selected)}
                          </h3>
                          <p className="governance-muted">
                            {timestamp(selected.createdAt)}
                            <br />
                            {selected.actor?.email ?? t.noActor}
                          </p>
                        </div>
                        {selected.id !== snapshot.history[0]?.id ? (
                          <button
                            className="small"
                            disabled={busy || loading || needsRefresh}
                            onClick={() => {
                              setPending({
                                kind: "rollback",
                                version: selected,
                              });
                              setNotice(null);
                              setError(null);
                            }}
                          >
                            <RotateCcw aria-hidden="true" />
                            {t.restore}
                          </button>
                        ) : (
                          <span className="governance-badge">{t.current}</span>
                        )}
                      </header>
                      {selected.restoredFrom ? (
                        <p className="governance-help">
                          {t.from}:{" "}
                          {snapshot.history.find(
                            (version) => version.id === selected.restoredFrom,
                          )
                            ? `V${snapshot.history.find((version) => version.id === selected.restoredFrom)!.number}`
                            : selected.restoredFrom}
                        </p>
                      ) : null}
                      {selected.action === "baseline" ? (
                        <p className="governance-help">{t.initial}</p>
                      ) : previous ? (
                        <section className="governance-changes">
                          <h4>
                            {t.changed} <span>{changes.length}</span>
                          </h4>
                          {changes.length ? (
                            changes.map((change) => (
                              <details
                                className="governance-change"
                                key={change.id}
                              >
                                <summary>
                                  {change.after?.name ?? change.before?.name}
                                  {!change.before ? (
                                    <span>{t.added}</span>
                                  ) : !change.after ? (
                                    <span>{t.removed}</span>
                                  ) : null}
                                </summary>
                                <div className="governance-before-after">
                                  <div>
                                    <h5>{t.before}</h5>
                                    <RuleSummary
                                      rule={change.before}
                                      language={language}
                                    />
                                  </div>
                                  <div>
                                    <h5>{t.after}</h5>
                                    <RuleSummary
                                      rule={change.after}
                                      language={language}
                                    />
                                  </div>
                                </div>
                              </details>
                            ))
                          ) : (
                            <p className="governance-help">{t.noChanges}</p>
                          )}
                        </section>
                      ) : (
                        <p className="governance-help">{t.previousMissing}</p>
                      )}
                      <details className="governance-rules-preview">
                        <summary>
                          {t.preview}{" "}
                          <span>{selected.portfolios.length} AP</span>
                        </summary>
                        <div>
                          {selected.portfolios.map((rule) => (
                            <section key={rule.id}>
                              <h4>{rule.name}</h4>
                              <RuleSummary rule={rule} language={language} />
                            </section>
                          ))}
                        </div>
                      </details>
                    </div>
                  ) : null}
                </div>
              </section>
              {snapshot.role === "owner" ? (
                <section
                  role="tabpanel"
                  id="governance-panel-administrators"
                  aria-labelledby="governance-tab-administrators"
                  hidden={tab !== "administrators"}
                >
                  <div className="governance-owner-note">
                    <LockKeyhole aria-hidden="true" />
                    {t.ownerNote}
                  </div>
                  <form
                    className="governance-add"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!busy && !loading && !needsRefresh && email.trim()) {
                        setPending({ kind: "grant", email: email.trim() });
                        setNotice(null);
                        setError(null);
                      }
                    }}
                  >
                    <h3>
                      <UserPlus aria-hidden="true" />
                      {t.addTitle}
                    </h3>
                    <p>{t.addHelp}</p>
                    <div>
                      <label htmlFor="governance-email">
                        {t.email}
                        <input
                          id="governance-email"
                          type="email"
                          autoComplete="email"
                          maxLength={254}
                          required
                          value={email}
                          disabled={busy}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                      </label>
                      <button
                        disabled={
                          busy || loading || needsRefresh || !email.trim()
                        }
                      >
                        <UserPlus aria-hidden="true" />
                        {t.add}
                      </button>
                    </div>
                  </form>
                  <ul className="governance-admin-list">
                    {snapshot.administrators.map((administrator) => (
                      <li
                        key={
                          administrator.userId ?? `owner-${administrator.email}`
                        }
                      >
                        <div>
                          <strong className="governance-email">
                            {administrator.email}
                          </strong>
                          <span
                            className={`governance-badge ${administrator.role === "owner" ? "owner" : ""}`}
                          >
                            {administrator.role === "owner" ? t.owner : t.admin}
                          </span>
                          {administrator.role === "owner" ? (
                            <small>{t.protectedOwner}</small>
                          ) : (
                            <small>
                              {t.addedAt}: {timestamp(administrator.addedAt)}
                              {administrator.addedBy ? (
                                <>
                                  <br />
                                  {t.addedBy}: {administrator.addedBy.email}
                                </>
                              ) : null}
                            </small>
                          )}
                        </div>
                        {administrator.role !== "owner" &&
                        administrator.userId ? (
                          <button
                            className="small danger"
                            disabled={busy || loading || needsRefresh}
                            onClick={() => {
                              setPending({ kind: "revoke", administrator });
                              setNotice(null);
                              setError(null);
                            }}
                          >
                            <Trash2 aria-hidden="true" />
                            {t.revoke}
                          </button>
                        ) : (
                          <ShieldCheck
                            className="governance-owner-icon"
                            aria-hidden="true"
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                  {!snapshot.administrators.some(
                    (administrator) => administrator.role === "admin",
                  ) ? (
                    <p className="governance-help">{t.noAdmins}</p>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
