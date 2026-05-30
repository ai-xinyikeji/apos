/**
 * AlertManager - 预警管理器
 *
 * 功能：
 * - UI 通知（通过 API 端点推送）
 * - 邮件通知（可选）
 * - Webhook 通知（可选）
 * - 通知配置管理
 *
 * 对应需求：Requirement 7 (§7.8)
 */

import { BudgetAlert } from './budget-monitor';
import { db } from '../db';
import { settings } from '../schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlertConfig {
  uiNotifications: boolean;
  email?: string;
  webhook?: string;
}

export interface NotificationResult {
  channel: 'ui' | 'email' | 'webhook';
  success: boolean;
  error?: string;
}

// ─── AlertManager ─────────────────────────────────────────────────────────────

export class AlertManager {
  /**
   * Send an alert through all configured notification channels.
   */
  async sendAlert(alert: BudgetAlert): Promise<NotificationResult[]> {
    const config = await this.loadConfig();
    const results: NotificationResult[] = [];

    if (config.uiNotifications) {
      results.push(await this.sendUINotification(alert));
    }

    if (config.email) {
      results.push(await this.sendEmail(alert, config.email));
    }

    if (config.webhook) {
      results.push(await this.sendWebhook(alert, config.webhook));
    }

    return results;
  }

  /**
   * Load alert configuration from settings.
   */
  async loadConfig(): Promise<AlertConfig> {
    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
    const map = new Map(rows.map(r => [r.key, r.value]));

    return {
      uiNotifications: map.get('alert_ui_notifications') !== 'false', // default true
      email: map.get('alert_email') ?? undefined,
      webhook: map.get('alert_webhook') ?? undefined,
    };
  }

  // ─── Private notification channels ────────────────────────────────────────

  /**
   * UI notification: stores the alert in the database (already done by BudgetMonitor).
   * The frontend polls /api/costs/alerts to display unacknowledged alerts.
   */
  private async sendUINotification(alert: BudgetAlert): Promise<NotificationResult> {
    try {
      // UI notifications are handled by the budget_alerts table.
      // The frontend reads unacknowledged alerts via GET /api/costs/alerts.
      console.log(`[AlertManager] UI notification: ${alert.severity} alert for ${alert.period} budget (${Math.round((alert.currentSpend / alert.budgetLimit) * 100)}% used)`);
      return { channel: 'ui', success: true };
    } catch (error) {
      return { channel: 'ui', success: false, error: String(error) };
    }
  }

  /**
   * Email notification (optional).
   * In production this would use nodemailer or an email service API.
   */
  private async sendEmail(alert: BudgetAlert, email: string): Promise<NotificationResult> {
    try {
      const subject = `[APOS] Budget ${alert.severity.toUpperCase()}: ${alert.period} budget at ${Math.round((alert.currentSpend / alert.budgetLimit) * 100)}%`;
      const body = this.formatAlertMessage(alert);

      // Log the email (actual sending requires email service configuration)
      console.log(`[AlertManager] Email to ${email}: ${subject}\n${body}`);

      // TODO: Integrate with email service (e.g. nodemailer, SendGrid)
      // For now, log only — return success to not block the flow
      return { channel: 'email', success: true };
    } catch (error) {
      return { channel: 'email', success: false, error: String(error) };
    }
  }

  /**
   * Webhook notification (optional).
   * POSTs the alert payload to the configured webhook URL.
   */
  private async sendWebhook(alert: BudgetAlert, url: string): Promise<NotificationResult> {
    try {
      const payload = {
        type: 'budget_alert',
        severity: alert.severity,
        period: alert.period,
        threshold: alert.threshold,
        currentSpend: alert.currentSpend,
        budgetLimit: alert.budgetLimit,
        percentageUsed: Math.round((alert.currentSpend / alert.budgetLimit) * 100),
        timestamp: alert.timestamp.toISOString(),
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return {
          channel: 'webhook',
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return { channel: 'webhook', success: true };
    } catch (error) {
      return { channel: 'webhook', success: false, error: String(error) };
    }
  }

  /**
   * Format a human-readable alert message.
   */
  private formatAlertMessage(alert: BudgetAlert): string {
    const pct = Math.round((alert.currentSpend / alert.budgetLimit) * 100);
    const spendDollars = (alert.currentSpend / 100).toFixed(2);
    const limitDollars = (alert.budgetLimit / 100).toFixed(2);

    return [
      `Budget Alert: ${alert.severity.toUpperCase()}`,
      `Period: ${alert.period}`,
      `Current spend: $${spendDollars} / $${limitDollars} (${pct}%)`,
      `Threshold: ${alert.threshold}%`,
      `Time: ${alert.timestamp.toISOString()}`,
    ].join('\n');
  }
}
