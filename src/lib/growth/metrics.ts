/**
 * Growth Metrics System
 * Tracks usage, features, and user behavior
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface MetricEvent {
  event: string;
  properties?: Record<string, any>;
  timestamp?: Date;
}

export interface FeatureUsage {
  feature: string;
  count: number;
  lastUsed: Date;
  avgDuration?: number;
}

export class MetricsCollector {
  /**
   * Track an event
   */
  async track(event: string, properties: Record<string, any> = {}): Promise<void> {
    try {
      // Store in database (we'll create a metrics table)
      await db.run(sql`
        INSERT INTO metrics (event, properties, timestamp)
        VALUES (${event}, ${JSON.stringify(properties)}, ${new Date().toISOString()})
      `);
      
      console.log(`📊 Metric tracked: ${event}`, properties);
    } catch (error) {
      console.error('Failed to track metric:', error);
    }
  }
  
  /**
   * Track feature usage
   */
  async trackFeature(feature: string, duration?: number): Promise<void> {
    await this.track('feature_used', {
      feature,
      duration,
    });
  }
  
  /**
   * Track page view
   */
  async trackPageView(page: string): Promise<void> {
    await this.track('page_view', { page });
  }
  
  /**
   * Track agent execution
   */
  async trackAgentExecution(agentName: string, success: boolean, duration: number): Promise<void> {
    await this.track('agent_execution', {
      agentName,
      success,
      duration,
    });
  }
  
  /**
   * Track prototype creation
   */
  async trackPrototypeCreation(prototypeId: string, status: string): Promise<void> {
    await this.track('prototype_created', {
      prototypeId,
      status,
    });
  }
  
  /**
   * Get feature usage statistics
   */
  async getFeatureUsage(days: number = 30): Promise<FeatureUsage[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const results = await db.all(sql`
        SELECT 
          json_extract(properties, '$.feature') as feature,
          COUNT(*) as count,
          MAX(timestamp) as lastUsed,
          AVG(CAST(json_extract(properties, '$.duration') AS REAL)) as avgDuration
        FROM metrics
        WHERE event = 'feature_used'
          AND timestamp >= ${cutoffDate.toISOString()}
        GROUP BY feature
        ORDER BY count DESC
      `);
      
      return results.map((r: any) => ({
        feature: r.feature,
        count: r.count,
        lastUsed: new Date(r.lastUsed),
        avgDuration: r.avgDuration,
      }));
    } catch (error) {
      console.error('Failed to get feature usage:', error);
      return [];
    }
  }
  
  /**
   * Get agent execution statistics
   */
  async getAgentStats(days: number = 30): Promise<{
    agentName: string;
    totalExecutions: number;
    successRate: number;
    avgDuration: number;
  }[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const results = await db.all(sql`
        SELECT 
          json_extract(properties, '$.agentName') as agentName,
          COUNT(*) as totalExecutions,
          SUM(CASE WHEN json_extract(properties, '$.success') = 'true' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as successRate,
          AVG(CAST(json_extract(properties, '$.duration') AS REAL)) as avgDuration
        FROM metrics
        WHERE event = 'agent_execution'
          AND timestamp >= ${cutoffDate.toISOString()}
        GROUP BY agentName
        ORDER BY totalExecutions DESC
      `);
      
      return results.map((r: any) => ({
        agentName: r.agentName,
        totalExecutions: r.totalExecutions,
        successRate: r.successRate,
        avgDuration: r.avgDuration,
      }));
    } catch (error) {
      console.error('Failed to get agent stats:', error);
      return [];
    }
  }
  
  /**
   * Get page view statistics
   */
  async getPageViews(days: number = 30): Promise<{
    page: string;
    views: number;
  }[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const results = await db.all(sql`
        SELECT 
          json_extract(properties, '$.page') as page,
          COUNT(*) as views
        FROM metrics
        WHERE event = 'page_view'
          AND timestamp >= ${cutoffDate.toISOString()}
        GROUP BY page
        ORDER BY views DESC
      `);
      
      return results.map((r: any) => ({
        page: r.page,
        views: r.views,
      }));
    } catch (error) {
      console.error('Failed to get page views:', error);
      return [];
    }
  }
  
  /**
   * Get daily active usage
   */
  async getDailyActiveUsage(days: number = 30): Promise<{
    date: string;
    events: number;
  }[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const results = await db.all(sql`
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as events
        FROM metrics
        WHERE timestamp >= ${cutoffDate.toISOString()}
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `);
      
      return results.map((r: any) => ({
        date: r.date,
        events: r.events,
      }));
    } catch (error) {
      console.error('Failed to get daily active usage:', error);
      return [];
    }
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();
