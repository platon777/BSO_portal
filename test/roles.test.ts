import { describe, expect, it } from 'vitest';
import {
  UserRole,
  canAccessAdminReports,
  canAccessApplication,
  canEditAllBusinessData,
  canManageInvitations,
  isUndefinedRole,
} from '../types/auth';

describe('matrice officielle des rôles BSO', () => {
  it('autorise uniquement les rôles actifs à ouvrir la plateforme', () => {
    expect(canAccessApplication(UserRole.ADMIN)).toBe(true);
    expect(canAccessApplication(UserRole.MANAGER)).toBe(true);
    expect(canAccessApplication(UserRole.AGENT)).toBe(true);
    expect(canAccessApplication(UserRole.FINANCE)).toBe(true);
    expect(canAccessApplication(UserRole.NON_DEFINI)).toBe(false);
    expect(canAccessApplication(undefined)).toBe(false);
    expect(isUndefinedRole(UserRole.NON_DEFINI)).toBe(true);
  });

  it('réserve la modification globale à Admin, Manager et Finance', () => {
    expect(canEditAllBusinessData(UserRole.ADMIN)).toBe(true);
    expect(canEditAllBusinessData(UserRole.MANAGER)).toBe(true);
    expect(canEditAllBusinessData(UserRole.FINANCE)).toBe(true);
    expect(canEditAllBusinessData(UserRole.AGENT)).toBe(false);
    expect(canEditAllBusinessData(UserRole.NON_DEFINI)).toBe(false);
  });

  it('réserve invitations à Admin/Manager et validation/rapports à Admin/Manager/Finance', () => {
    expect(canManageInvitations(UserRole.ADMIN)).toBe(true);
    expect(canManageInvitations(UserRole.MANAGER)).toBe(true);
    expect(canManageInvitations(UserRole.FINANCE)).toBe(false);
    expect(canManageInvitations(UserRole.AGENT)).toBe(false);

    expect(canAccessAdminReports(UserRole.ADMIN)).toBe(true);
    expect(canAccessAdminReports(UserRole.MANAGER)).toBe(true);
    expect(canAccessAdminReports(UserRole.FINANCE)).toBe(true);
    expect(canAccessAdminReports(UserRole.AGENT)).toBe(false);
  });

  it('tolère les représentations textuelles renvoyées par des données historiques', () => {
    expect(canAccessApplication('agent de terrain')).toBe(true);
    expect(canEditAllBusinessData('manager')).toBe(true);
    expect(canManageInvitations('finance')).toBe(false);
    expect(isUndefinedRole('non défini')).toBe(true);
  });
});
