import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const list = await db.select().from(settings);
    const result = list.reduce((acc: Record<string, string | object>, item) => {
      const val = item.value;
      const sensitiveKeys = [
        'openai_api_key',
        'anthropic_api_key',
        'google_api_key',
        'deepseek_api_key',
        'custom_openai_api_key',
        'github_token',
        'chatgpt_cookies',
        'gemini_cookies',
        'kimi_cookies',
      ];

      // Headers keys: return parsed summary (key names + count), not raw values
      const headerKeys = ['chatgpt_headers', 'gemini_headers', 'kimi_headers'];

      if (sensitiveKeys.includes(item.key)) {
        let masked = '';
        if (val.length > 8) {
          masked = `${val.slice(0, 4)}••••••••${val.slice(-4)}`;
        } else {
          masked = '••••••••';
        }
        acc[item.key] = masked;
      } else if (headerKeys.includes(item.key)) {
        // Return the full headers JSON for display in settings page
        try {
          acc[item.key] = JSON.parse(val);
        } catch {
          acc[item.key] = val;
        }
      } else {
        acc[item.key] = val;
      }
      return acc;
    }, {});

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to get settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json(); // expected: Record<string, string | object>

    // Allowlist of valid setting keys to prevent arbitrary DB writes
    const ALLOWED_KEYS = new Set([
      'openai_api_key', 'anthropic_api_key', 'google_api_key',
      'deepseek_api_key', 'custom_openai_api_key', 'custom_openai_base_url',
      'custom_openai_model', 'github_token',
      'chatgpt_cookies', 'gemini_cookies', 'kimi_cookies',
      'chatgpt_headers', 'gemini_headers', 'kimi_headers',
      'use_ollama', 'use_lmstudio',
      'enable_smart_routing', 'enable_prompt_caching', 'enable_context_compression',
      'budget_daily', 'budget_weekly', 'budget_monthly',
      'budget_alert_thresholds', 'budget_auto_downgrade',
      'model_task_reasoning', 'model_task_coding', 'model_task_retrieval',
      'model_task_refactor', 'model_task_planning',
      'target_project_path', 'OPENHANDS_API_URL',
    ]);

    for (const [key, value] of Object.entries(body)) {
      // Skip unknown keys silently — don't write arbitrary data to DB
      if (!ALLOWED_KEYS.has(key)) {
        console.warn(`[settings] Ignoring unknown key: ${key}`);
        continue;
      }
      // Handle both string and object values (headers are objects/JSON)
      let cleanVal: string;

      if (typeof value === 'object' && value !== null) {
        cleanVal = JSON.stringify(value);
      } else if (typeof value === 'string') {
        // Skip if the user didn't change the masked placeholder
        if (value.includes('••••••••')) continue;
        cleanVal = value.trim();
      } else if (value === null || value === undefined) {
        continue;
      } else {
        cleanVal = String(value).trim();
      }

      if (!cleanVal) {
        // If empty, delete from db
        await db.delete(settings).where(eq(settings.key, key));
        continue;
      }

      const existing = await db.select().from(settings).where(eq(settings.key, key));
      if (existing.length > 0) {
        await db.update(settings)
          .set({ value: cleanVal, updatedAt: new Date().toISOString() })
          .where(eq(settings.key, key));
      } else {
        await db.insert(settings).values({
          key,
          value: cleanVal,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to save settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
