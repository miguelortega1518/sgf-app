import { describe, it, expect } from 'vitest';
import {
  canComment,
  canCreateSpace,
  canChangeDueDate,
  canApproveTask,
  canViewManagementPanel,
  canManageUsers,
  canExport,
  canCreateEditTemplates,
  canGenerateOrCloseRecurring,
} from '../src/lib/permissions';

describe('permissions', () => {
  describe('canComment', () => {
    it('admin can comment', () => expect(canComment('admin')).toBe(true));
    it('miembro can comment', () => expect(canComment('miembro')).toBe(true));
    it('observador cannot comment', () => expect(canComment('observador')).toBe(false));
  });

  describe('canCreateSpace', () => {
    it('admin can create', () => expect(canCreateSpace('admin')).toBe(true));
    it('miembro can create', () => expect(canCreateSpace('miembro')).toBe(true));
    it('observador cannot create', () => expect(canCreateSpace('observador')).toBe(false));
  });

  describe('canChangeDueDate', () => {
    it('admin always can', () => {
      expect(canChangeDueDate('admin', 'recurrente', false, false)).toBe(true);
      expect(canChangeDueDate('admin', 'proyecto', false, false)).toBe(true);
    });

    it('miembro cannot change date in recurrente', () => {
      expect(canChangeDueDate('miembro', 'recurrente', false, true)).toBe(false);
      expect(canChangeDueDate('miembro', 'recurrente', true, true)).toBe(false);
    });

    it('miembro can change own task date in proyecto', () => {
      expect(canChangeDueDate('miembro', 'proyecto', false, true)).toBe(true);
    });

    it('miembro cannot change others task date in proyecto unless owner', () => {
      expect(canChangeDueDate('miembro', 'proyecto', false, false)).toBe(false);
      expect(canChangeDueDate('miembro', 'proyecto', true, false)).toBe(true);
    });

    it('observador never can', () => {
      expect(canChangeDueDate('observador', 'proyecto', false, true)).toBe(false);
    });
  });

  describe('canApproveTask', () => {
    it('admin can approve any task', () => {
      expect(canApproveTask('admin', 'user1', 'user2')).toBe(true);
    });

    it('reviewer can approve', () => {
      expect(canApproveTask('miembro', 'reviewer1', 'reviewer1')).toBe(true);
    });

    it('non-reviewer miembro cannot approve', () => {
      expect(canApproveTask('miembro', 'user1', 'reviewer1')).toBe(false);
    });

    it('observador cannot approve', () => {
      expect(canApproveTask('observador', 'user1', 'user1')).toBe(false);
    });
  });

  describe('admin-only permissions', () => {
    it('only admin sees management panel', () => {
      expect(canViewManagementPanel('admin')).toBe(true);
      expect(canViewManagementPanel('miembro')).toBe(false);
      expect(canViewManagementPanel('observador')).toBe(false);
    });

    it('only admin manages users', () => {
      expect(canManageUsers('admin')).toBe(true);
      expect(canManageUsers('miembro')).toBe(false);
    });

    it('only admin creates templates', () => {
      expect(canCreateEditTemplates('admin')).toBe(true);
      expect(canCreateEditTemplates('miembro')).toBe(false);
    });

    it('only admin generates/closes recurring', () => {
      expect(canGenerateOrCloseRecurring('admin')).toBe(true);
      expect(canGenerateOrCloseRecurring('miembro')).toBe(false);
    });
  });

  describe('canExport', () => {
    it('admin and miembro can export', () => {
      expect(canExport('admin')).toBe(true);
      expect(canExport('miembro')).toBe(true);
    });

    it('observador cannot export', () => {
      expect(canExport('observador')).toBe(false);
    });
  });
});
