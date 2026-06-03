import cron from 'node-cron';
import { SignalCollectorAgent } from '@/agents/signal-collector';
import { ReportGeneratorAgent } from '@/agents/report-generator';
import crypto from 'crypto';

let isSchedulerStarted = false;

/**
 * Initializes cron jobs for local background tasks.
 * Cron 1: Daily signal harvesting (2:00 AM)
 * Cron 2: Weekly PM report synthesis (Monday 3:00 AM)
 */
export function startScheduler() {
  if (isSchedulerStarted) return;
  isSchedulerStarted = true;

  console.log('[Scheduler] 本地任务自动调度服务已就绪。');

  // 1. Daily Signal Collection (2:00 AM)
  cron.schedule('0 2 * * *', async () => {
    const runId = crypto.randomUUID();
    console.log(`[Scheduler] [Run: ${runId}] 启动每日反馈信号采集调度任务...`);
    const agent = new SignalCollectorAgent();
    try {
      await agent.execute({ sources: ['amplitude', 'zendesk', 'competitor'] }, runId);
    } catch (err) {
      console.error(`[Scheduler] [Run: ${runId}] 信号采集定时任务失败:`, err);
    }
  });

  // 2. Weekly Insight Report Synthesis (Monday 3:00 AM)
  cron.schedule('0 3 * * 1', async () => {
    const runId = crypto.randomUUID();
    console.log(`[Scheduler] [Run: ${runId}] 启动周度产品洞察报告合成调度任务...`);
    const agent = new ReportGeneratorAgent();
    try {
      await agent.execute({ title: `每周需求与竞品洞察周报 (${new Date().toLocaleDateString()})` }, runId);
    } catch (err) {
      console.error(`[Scheduler] [Run: ${runId}] 报告合成定时任务失败:`, err);
    }
  });
}
