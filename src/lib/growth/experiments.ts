/**
 * A/B Testing Experiment Engine
 * Manages experiment setup, variant allocation, conversion tracking, and statistical lift calculations.
 */

import { db } from '../db';
import { experiments } from '../schema';
import { eq, sql } from 'drizzle-orm';

export interface Experiment {
  id: number;
  name: string;
  feature: string;
  status: 'draft' | 'active' | 'completed';
  variantA: string;
  variantB: string;
  countA: number;
  countB: number;
  conversionA: number;
  conversionB: number;
  createdAt: string;
  updatedAt: string;
}

export class ExperimentEngine {
  /**
   * Creates a new A/B testing experiment.
   */
  async createExperiment(
    name: string,
    feature: string,
    variantA: string = 'control',
    variantB: string = 'treatment'
  ): Promise<number> {
    const result = await db.insert(experiments).values({
      name,
      feature,
      status: 'draft',
      variantA,
      variantB,
      countA: 0,
      countB: 0,
      conversionA: 0,
      conversionB: 0,
    });
    
    // SQLite primary key auto increment returns rowid
    return result.lastInsertRowid ? Number(result.lastInsertRowid) : 1;
  }

  /**
   * Allocates a variant (A or B) deterministically for a user based on their ID.
   */
  async getVariant(experimentId: number, userId: string): Promise<string> {
    const [exp] = await db
      .select()
      .from(experiments)
      .where(eq(experiments.id, experimentId));

    if (!exp || exp.status !== 'active') {
      return exp?.variantA || 'control';
    }

    // Deterministic split: hash the userId and experimentId together
    const hash = this.simpleHash(`${experimentId}:${userId}`);
    const variant = hash % 2 === 0 ? exp.variantA : exp.variantB;

    // Increment allocation counts in background
    try {
      if (variant === exp.variantA) {
        await db
          .update(experiments)
          .set({ countA: (exp.countA || 0) + 1, updatedAt: new Date().toISOString() })
          .where(eq(experiments.id, experimentId));
      } else {
        await db
          .update(experiments)
          .set({ countB: (exp.countB || 0) + 1, updatedAt: new Date().toISOString() })
          .where(eq(experiments.id, experimentId));
      }
    } catch (err) {
      console.error('Failed to increment variant count:', err);
    }

    return variant;
  }

  /**
   * Records a conversion event for a variant in an experiment.
   */
  async recordConversion(experimentId: number, variant: string): Promise<void> {
    const [exp] = await db
      .select()
      .from(experiments)
      .where(eq(experiments.id, experimentId));

    if (!exp || exp.status !== 'active') return;

    if (variant === exp.variantA) {
      await db
        .update(experiments)
        .set({ conversionA: (exp.conversionA || 0) + 1, updatedAt: new Date().toISOString() })
        .where(eq(experiments.id, experimentId));
    } else if (variant === exp.variantB) {
      await db
        .update(experiments)
        .set({ conversionB: (exp.conversionB || 0) + 1, updatedAt: new Date().toISOString() })
        .where(eq(experiments.id, experimentId));
    }
  }

  /**
   * Starts the experiment.
   */
  async startExperiment(experimentId: number): Promise<void> {
    await db
      .update(experiments)
      .set({ status: 'active', updatedAt: new Date().toISOString() })
      .where(eq(experiments.id, experimentId));
  }

  /**
   * Completes the experiment.
   */
  async completeExperiment(experimentId: number): Promise<void> {
    await db
      .update(experiments)
      .set({ status: 'completed', updatedAt: new Date().toISOString() })
      .where(eq(experiments.id, experimentId));
  }

  /**
   * Generates a conversion analysis report including statistical lift.
   */
  async analyzeExperiment(experimentId: number): Promise<{
    name: string;
    status: string;
    rateA: number;
    rateB: number;
    lift: number;
    winner: string;
    confidence: string;
  } | null> {
    const [exp] = await db
      .select()
      .from(experiments)
      .where(eq(experiments.id, experimentId));

    if (!exp) return null;

    const countA = exp.countA || 0;
    const countB = exp.countB || 0;
    const convA = exp.conversionA || 0;
    const convB = exp.conversionB || 0;

    const rateA = countA > 0 ? (convA / countA) * 100 : 0;
    const rateB = countB > 0 ? (convB / countB) * 100 : 0;

    let lift = 0;
    if (rateA > 0) {
      lift = ((rateB - rateA) / rateA) * 100;
    }

    let winner = 'Undecided';
    let confidence = 'Low (under 90%)';

    if (countA > 30 && countB > 30) {
      // Basic z-score calculation for conversion rates
      const pA = convA / countA;
      const pB = convB / countB;
      const pPool = (convA + convB) / (countA + countB);
      
      if (pPool > 0 && pPool < 1) {
        const se = Math.sqrt(pPool * (1 - pPool) * (1 / countA + 1 / countB));
        const zScore = se > 0 ? (pB - pA) / se : 0;
        const absZ = Math.abs(zScore);

        if (absZ >= 1.96) {
          confidence = 'High (95%+)';
          winner = pB > pA ? exp.variantB : exp.variantA;
        } else if (absZ >= 1.645) {
          confidence = 'Moderate (90%+)';
          winner = pB > pA ? exp.variantB : exp.variantA;
        }
      }
    }

    return {
      name: exp.name,
      status: exp.status,
      rateA: Number(rateA.toFixed(2)),
      rateB: Number(rateB.toFixed(2)),
      lift: Number(lift.toFixed(2)),
      winner,
      confidence,
    };
  }

  /**
   * Helper hash function.
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  }
}

// Singleton instance
export const experimentEngine = new ExperimentEngine();
