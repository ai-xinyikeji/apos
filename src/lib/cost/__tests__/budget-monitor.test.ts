/**
 * Tests for BudgetMonitor
 */

import { BudgetMonitor } from '../budget-monitor';
import { db } from '../../db';

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

function mockSelect(returnValue: unknown) {
  (db.select as jest.Mock).mockReturnValue({
    from: jest.fn().mockResolvedValue(returnValue),
    where: jest.fn().mockResolvedValue(returnValue),
  });
}

describe('BudgetMonitor', () => {
  let monitor: BudgetMonitor;

  beforeEach(() => {
    jest.clearAllMocks();
    monitor = new BudgetMonitor();
    (db.insert as jest.Mock).mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
    (db.update as jest.Mock).mockReturnValue({ set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) });
  });

  // ── getBudgetConfig ────────────────────────────────────────────────────────

  describe('getBudgetConfig()', () => {
    it('parses budget settings from DB', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'budget_daily', value: '10.00' },
          { key: 'budget_monthly', value: '200.00' },
          { key: 'budget_alert_thresholds', value: '[50, 80, 100]' },
          { key: 'budget_auto_downgrade', value: 'true' },
        ]),
      });
      const config = await monitor.getBudgetConfig();
      expect(config.daily).toBe(1000);
      expect(config.monthly).toBe(20000);
      expect(config.alertThresholds).toEqual([50, 80, 100]);
      expect(config.autoDowngrade).toBe(true);
    });

    it('uses default thresholds when not configured', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });
      const config = await monitor.getBudgetConfig();
      expect(config.alertThresholds).toEqual([50, 80, 100]);
      expect(config.autoDowngrade).toBe(false);
    });
  });

  // ── checkBudgets ──────────────────────────────────────────────────────────

  describe('checkBudgets()', () => {
    it('returns empty array when no budgets configured', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
        where: jest.fn().mockResolvedValue([]),
      });
      const alerts = await monitor.checkBudgets();
      expect(alerts).toEqual([]);
    });

    it('generates warning alert at 80% threshold', async () => {
      let callCount = 0;
      (db.select as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // settings query: db.select({...}).from(settings)
          return {
            from: jest.fn().mockResolvedValue([
              { key: 'budget_monthly', value: '10.00' },
              { key: 'budget_alert_thresholds', value: '[80, 100]' },
            ]),
          };
        }
        // cost_records query: db.select({...}).from(costRecords).where(...)
        return {
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ total: 850 }]), // $8.50 = 85% of $10
        };
      });

      const alerts = await monitor.checkBudgets();
      expect(alerts.length).toBeGreaterThan(0);
      const warningAlert = alerts.find(a => a.severity === 'warning');
      expect(warningAlert).toBeDefined();
    });

    it('generates critical alert at 100% threshold', async () => {
      let callCount = 0;
      (db.select as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: jest.fn().mockResolvedValue([
              { key: 'budget_monthly', value: '10.00' },
              { key: 'budget_alert_thresholds', value: '[80, 100]' },
            ]),
          };
        }
        return {
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ total: 1050 }]), // $10.50 = 105%
        };
      });

      const alerts = await monitor.checkBudgets();
      const criticalAlert = alerts.find(a => a.severity === 'critical');
      expect(criticalAlert).toBeDefined();
    });
  });

  // ── shouldDowngrade ────────────────────────────────────────────────────────

  describe('shouldDowngrade()', () => {
    it('returns false when auto_downgrade is disabled', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([{ key: 'budget_auto_downgrade', value: 'false' }]),
      });
      const result = await monitor.shouldDowngrade();
      expect(result).toBe(false);
    });

    it('returns false when within budget', async () => {
      let callCount = 0;
      (db.select as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: jest.fn().mockResolvedValue([
              { key: 'budget_auto_downgrade', value: 'true' },
              { key: 'budget_monthly', value: '10.00' },
            ]),
          };
        }
        return {
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ total: 500 }]), // $5 < $10
        };
      });
      const result = await monitor.shouldDowngrade();
      expect(result).toBe(false);
    });

    it('returns true when budget exceeded and auto_downgrade enabled', async () => {
      let callCount = 0;
      (db.select as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: jest.fn().mockResolvedValue([
              { key: 'budget_auto_downgrade', value: 'true' },
              { key: 'budget_monthly', value: '10.00' },
            ]),
          };
        }
        return {
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ total: 1100 }]), // $11 > $10
        };
      });
      const result = await monitor.shouldDowngrade();
      expect(result).toBe(true);
    });
  });

  // ── acknowledgeAlert ──────────────────────────────────────────────────────

  describe('acknowledgeAlert()', () => {
    it('updates alert acknowledged status in DB', async () => {
      const mockWhere = jest.fn().mockResolvedValue(undefined);
      const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
      (db.update as jest.Mock).mockReturnValue({ set: mockSet });

      await monitor.acknowledgeAlert('alert-123');
      expect(db.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ acknowledged: 1 })
      );
    });
  });
});
