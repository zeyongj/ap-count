import type { APPortfolio } from "./types";

export type AccessRole = "visitor" | "admin" | "owner";
export interface RuleActor {
  userId: string;
  email: string;
}
export interface Administrator {
  userId: string | null;
  email: string;
  role: "owner" | "admin";
  addedAt: string | null;
  addedBy: RuleActor | null;
}
export interface RuleVersion {
  id: string;
  number: number;
  createdAt: string | null;
  actor: RuleActor | null;
  action: "baseline" | "save" | "rollback";
  restoredFrom: string | null;
  portfolios: APPortfolio[];
}
export interface AdminStatus {
  canEdit: boolean;
  role: AccessRole;
  canManageAdmins: boolean;
}
export interface GovernanceSnapshot {
  revision: string;
  role: "owner" | "admin";
  /** Full roster is visible only to the Owner; Admin receives an empty array. */
  administrators: Administrator[];
  /** Newest first. A rollback creates a new version, preserving earlier entries. */
  history: RuleVersion[];
  historyLimit: number;
}
export type GovernanceAction =
  | { revision: string; action: "grant-admin"; email: string }
  | { revision: string; action: "revoke-admin"; userId: string }
  | { revision: string; action: "rollback"; versionId: string };
