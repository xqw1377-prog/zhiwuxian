/**
 * WUXIAN · 多租户 Workspace 基础架构
 * 支持家庭组/小班共享额度、权限管理
 */

import { v4 as uuid } from 'uuid';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  ownerId: string;
  memberCount: number;
  totalWarpMinutes: number;
  usedWarpMinutes: number;
}

export interface WorkspaceMember {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  displayName: string;
  joinedAt: string;
}

export interface WorkspaceInvite {
  code: string;
  workspaceId: string;
  createdBy: string;
  role: WorkspaceRole;
  expiresAt: string;
  maxUses: number;
  useCount: number;
}

const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function canManage(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole] && actorRole !== 'viewer';
}

export function canInvite(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function canRemoveMember(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
}

export function createWorkspace(
  name: string,
  description: string,
  ownerId: string,
): Workspace {
  return {
    id: `ws_${uuid().slice(0, 12)}`,
    name,
    description,
    createdAt: new Date().toISOString(),
    ownerId,
    memberCount: 1,
    totalWarpMinutes: 0,
    usedWarpMinutes: 0,
  };
}

export function createMember(
  userId: string,
  workspaceId: string,
  role: WorkspaceRole,
  displayName: string,
): WorkspaceMember {
  return {
    userId,
    workspaceId,
    role,
    displayName,
    joinedAt: new Date().toISOString(),
  };
}

export function createInvite(
  workspaceId: string,
  createdBy: string,
  role: WorkspaceRole,
  maxUses: number = 10,
  expiresInDays: number = 7,
): WorkspaceInvite {
  const expires = new Date();
  expires.setDate(expires.getDate() + expiresInDays);

  return {
    code: `inv_${uuid().slice(0, 8)}`,
    workspaceId,
    createdBy,
    role,
    expiresAt: expires.toISOString(),
    maxUses,
    useCount: 0,
  };
}

export function isInviteValid(invite: WorkspaceInvite): boolean {
  if (invite.useCount >= invite.maxUses) return false;
  if (new Date(invite.expiresAt) < new Date()) return false;
  return true;
}

export function getAvailableRoles(exclude?: WorkspaceRole[]): WorkspaceRole[] {
  const all: WorkspaceRole[] = ['owner', 'admin', 'member', 'viewer'];
  return exclude ? all.filter((r) => !exclude.includes(r)) : all;
}
