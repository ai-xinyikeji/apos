/**
 * Tests for AlertManager
 */

import { AlertManager } from '../alert-manager';
import { BudgetAlert } from '../budget-monitor';
import { db } from '../../db';

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
  },
}));

// Mock global fetch
global.fetch = jest.fn();

const mockAlert: BudgetAlert = {
  id: 'alert-1',
  timestamp: new Date('2024-01-15T10:00:00Z'),
  period: 'monthly',
  threshold: 80,
  currentSpend: 850,
  budgetLimit: 1000,
  severity: 'warning',
  acknowledged: false,
};

describe('AlertManager', () => {
  let manager: AlertManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new AlertManager();
  });

  // ── loadConfig ─────────────────────────────────────────────────────────────

  describe('loadConfig()', () => {
    it('loads config from settings', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'alert_ui_notifications', value: 'true' },
          { key: 'alert_email', value: 'admin@example.com' },
          { key: 'alert_webhook', value: 'https://hooks.example.com/alert' },
        ]),
      });
      const config = await manager.loadConfig();
      expect(config.uiNotifications).toBe(true);
      expect(config.email).toBe('admin@example.com');
      expect(config.webhook).toBe('https://hooks.example.com/alert');
    });

    it('defaults to UI notifications enabled', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });
      const config = await manager.loadConfig();
      expect(config.uiNotifications).toBe(true);
      expect(config.email).toBeUndefined();
      expect(config.webhook).toBeUndefined();
    });

    it('disables UI notifications when explicitly set to false', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'alert_ui_notifications', value: 'false' },
        ]),
      });
      const config = await manager.loadConfig();
      expect(config.uiNotifications).toBe(false);
    });
  });

  // ── sendAlert ──────────────────────────────────────────────────────────────

  describe('sendAlert()', () => {
    it('sends UI notification when enabled', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'alert_ui_notifications', value: 'true' },
        ]),
      });
      const results = await manager.sendAlert(mockAlert);
      const uiResult = results.find(r => r.channel === 'ui');
      expect(uiResult).toBeDefined();
      expect(uiResult?.success).toBe(true);
    });

    it('sends webhook when configured', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'alert_webhook', value: 'https://hooks.example.com/alert' },
        ]),
      });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const results = await manager.sendAlert(mockAlert);
      const webhookResult = results.find(r => r.channel === 'webhook');
      expect(webhookResult).toBeDefined();
      expect(webhookResult?.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.example.com/alert',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('handles webhook failure gracefully', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'alert_webhook', value: 'https://hooks.example.com/alert' },
        ]),
      });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

      const results = await manager.sendAlert(mockAlert);
      const webhookResult = results.find(r => r.channel === 'webhook');
      expect(webhookResult?.success).toBe(false);
      expect(webhookResult?.error).toContain('500');
    });

    it('handles fetch exception gracefully', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'alert_webhook', value: 'https://hooks.example.com/alert' },
        ]),
      });
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const results = await manager.sendAlert(mockAlert);
      const webhookResult = results.find(r => r.channel === 'webhook');
      expect(webhookResult?.success).toBe(false);
    });

    it('returns empty array when no channels configured', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'alert_ui_notifications', value: 'false' },
        ]),
      });
      const results = await manager.sendAlert(mockAlert);
      expect(results).toHaveLength(0);
    });
  });
});
