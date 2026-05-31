import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const list = await db.select().from(settings);
    const result = list.reduce((acc: Record<string, string>, item) => {
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
        'kimi_cookies'
      ];
      
      if (sensitiveKeys.includes(item.key)) {
        let masked = '';
        if (val.length > 8) {
          masked = `${val.slice(0, 4)}••••••••${val.slice(-4)}`;
        } else {
          masked = '••••••••';
        }
        acc[item.key] = masked;
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
    const body = await req.json(); // expected: Record<string, string>
    
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue;
      
      // Skip if the user didn't change the masked placeholder
      if (value.includes('••••••••')) continue;
      
      const cleanVal = value.trim();
      
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
