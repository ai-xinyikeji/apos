/**
 * BudgetMonitor - 预算监控器
 *
 * 功能：
 * - 检查各周期的预算使用情况
 * - 在阈值触发时生成预警
 * - 支持自动降级（切换到低成本模型）
 * - 预警确认功能
 *
 * 对应需求：Requirement 7
 */

import { db } from '../db';
import { budgetAlerts, settings, costRecords } from '../schema';
import { eq, sql, gte } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';

export interface BudgetConfig {
  daily?: number;    // cents
  weekly?: number;   // cents
  monthly?: number;  // cents
  alertThresholds: number[];  // e.g. [50, 80, 100]
  autoDowngrade: boolean;
}

export interface BudgetAlert {
  id: string;
  timestamp: Date;
  period: BudgetPeriod;
  threshold: number;
  currentSpend: number;  // cents
  budgetLimit: number;   // cents
  severity: AlertSeverity;
  acknowledged: boolean;
}

// ─── BudgetMonitor ────────────────────────────────────────────────────────────

export class BudgetMonitor {
  /**
   * Check all configured budget periods and generate alerts for exceeded thresholds.
   * Persists new alerts to the database.
   */
  async checkBudgets(): Promise<BudgetAlert[]> {
    const config = await this.getBudgetConfig();
    const alerts: BudgetAlert[] = [];

    for (const period of ['daily', 'weekly', 'monthly'] as BudgetPeriod[]) {
      const limit = config[period];
      if (!limit || limit <= 0) continue;

      const currentSpend = await this.getCurrentSpend(period);
      const percentage = (currentSpend / limit) * 100;

      for (const threshold of config.alertThresholds) {
        if (percentage >= threshold) {
          const severity = this.getSeverity(threshold);
          const alert: BudgetAlert = {
            id: this.generateId(),
            timestamp: new Date(),
            period,
            threshold,
            currentSpend,
            budgetLimit: limit,
            severity,
            acknowledged: false,
          };

          alerts.push(alert);

          // Persist to DB (non-blocking)
          this.persistAlert(alert).catch(err => {
            console.error('[BudgetMonitor] Failed to persist alert:', err);
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Mark an alert as acknowledged.
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    await db.update(budgetAlerts)
      .set({
        acknowledged: 1,
        acknowledgedAt: new Date().toISOString(),
      })
      .where(eq(budgetAlerts.id, alertId));
  }

  /**
   * Check whether auto-downgrade is enabled and budget is exceeded.
   * Returns true if the routing system should switch to a cheaper model.
   */
  async shouldDowngrade(): Promise<boolean> {
    const config = await this.getBudgetConfig();
    if (!config.autoDowngrade) return false;

    for (const period of ['daily', 'weekly', 'monthly'] as BudgetPeriod[]) {
      const limit = config[period];
      if (!limit || limit <= 0) continue;

      const currentSpend = await this.getCurrentSpend(period);
      if (currentSpend >= limit) return true;
    }

    return false;
  }

  /**
   * Get the current spend for a period (in cents).
   */
  async getCurrentSpend(period: BudgetPeriod): Promise<number> {
    const since = this.getPeriodStart(period);
    const rows = await db
      .select({ total: sql<number>`COALESCE(SUM(${costRecords.totalCost}), 0)` })
      .from(costRecords)
      .where(gte(costRecords.timestamp, since.toISOString()));

    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Load budget configuration from settings.
   */
  async getBudgetConfig(): Promise<BudgetConfig> {
    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
    const map = new Map(rows.map(r => [r.key, r.value]));

    const parseDollars = (key: string): number | undefined => {
      const val = map.get(key);
      if (!val) return undefined;
      const cents = Math.round(parseFloat(val) * 100);
      return isNaN(cents) ? undefined : cents;
    };

    const thresholdsStr = map.get('budget_alert_thresholds') ?? '[50, 80, 100]';
    let alertThresholds: number[] = [50, 80, 100];
    try {
      alertThresholds = JSON.parse(thresholdsStr);
    } catch {
      // use defaults
    }

    return {
      daily:   parseDollars('budget_daily'),
      weekly:  parseDollars('budget_weekly'),
      monthly: parseDollars('budget_monthly'),
      alertThresholds,
      autoDowngrade: map.get('budget_auto_downgrade') === 'true',
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private getSeverity(threshold: number): AlertSeverity {
    if (threshold >= 100) return 'critical';
    if (threshold >= 80)  return 'warning';
    return 'info';
  }

  private getPeriodStart(period: BudgetPeriod): Date {
    const now = new Date();
    switch (period) {
      case 'daily': {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'weekly': {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay());
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'monthly': {
        return new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }
  }

  private async persistAlert(alert: BudgetAlert): Promise<void> {
    await db.insert(budgetAlerts).values({
      id: alert.id,
      userId: null,
      period: alert.period,
      threshold: alert.threshold,
      currentSpend: alert.currentSpend,
      budgetLimit: alert.budgetLimit,
      severity: alert.severity,
      acknowledged: 0,
    });
  }

  private generateId(): string {
    return `ba_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
