/**
 * Direct test of ChatGPT Web API - debug sentinel token flow
 */

import { db } from './src/lib/db';
import { settings } from './src/lib/schema';
import { eq } from 'drizzle-orm';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

async function testChatGPT() {
  console.log('=== ChatGPT Web API Debug ===\n');

  const cookieSettings = await db.select().from(settings).where(eq(settings.key, 'chatgpt_cookies'));
  if (cookieSettings.length === 0) {
    console.error('No ChatGPT cookies found!');
    process.exit(1);
  }

  const cookies = cookieSettings[0].value;
  console.log('Cookies loaded, length:', cookies.length);

  const oaiDidMatch = cookies.match(/oai-did=([^;]+)/);
  const deviceId = oaiDidMatch ? oaiDidMatch[1] : crypto.randomUUID();
  console.log('Device ID from cookies:', deviceId);

  const baseHeaders: Record<string, string> = {
    'Cookie': cookies,
    'User-Agent': USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://chatgpt.com',
    'Referer': 'https://chatgpt.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Ch-Ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Oai-Device-Id': deviceId,
    'Oai-Language': 'en-US',
    'Oai-Client-Build-Number': '7022011',
    'Oai-Client-Version': 'prod-938b17ddad47af377f3f6c1fa84ec33e3379c73d',
  };

  // Step 1: Get access token
  console.log('\n--- Step 1: Get access token ---');
  const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
    headers: { ...baseHeaders, 'Accept': 'application/json' },
  });
  console.log('Session status:', sessionRes.status);
  const sessionData = await sessionRes.json();
  const accessToken = sessionData?.accessToken;
  console.log('Access token:', accessToken ? accessToken.substring(0, 30) + '...' : 'MISSING');

  if (!accessToken) process.exit(1);

  const authHeaders = { ...baseHeaders, 'Authorization': `Bearer ${accessToken}` };

  // Step 2: Get sentinel chat requirements
  console.log('\n--- Step 2: Get sentinel chat-requirements ---');
  const reqRes = await fetch('https://chatgpt.com/backend-api/sentinel/chat-requirements', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  console.log('Requirements status:', reqRes.status);
  const reqText = await reqRes.text();
  console.log('Requirements response:', reqText.substring(0, 500));

  let chatToken: string | undefined;
  let proofofwork: any;
  let turnstile: any;
  try {
    const reqData = JSON.parse(reqText);
    chatToken = reqData?.token;
    proofofwork = reqData?.proofofwork;
    turnstile = reqData?.turnstile;
    console.log('Chat token:', chatToken ? 'obtained' : 'MISSING');
    console.log('proofofwork:', JSON.stringify(proofofwork));
    console.log('turnstile:', JSON.stringify(turnstile));
    console.log('expire_after:', reqData?.expire_after);
    console.log('so:', JSON.stringify(reqData?.so));
  } catch (e) {
    console.error('Failed to parse requirements response');
  }

  // Step 3: Try the conversation
  console.log('\n--- Step 3: Call /backend-api/f/conversation ---');
  const convHeaders: Record<string, string> = {
    ...authHeaders,
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };
  if (chatToken) {
    convHeaders['Openai-Sentinel-Chat-Requirements-Token'] = chatToken;
  }

  const convRes = await fetch('https://chatgpt.com/backend-api/f/conversation', {
    method: 'POST',
    headers: convHeaders,
    body: JSON.stringify({
      action: 'next',
      messages: [{
        id: crypto.randomUUID(),
        author: { role: 'user' },
        create_time: Date.now() / 1000,
        content: { content_type: 'text', parts: ['Say hello in one word.'] },
        metadata: {},
      }],
      parent_message_id: crypto.randomUUID(),
      model: 'auto',
      timezone_offset_min: -480,
      timezone: 'Asia/Shanghai',
      conversation_mode: { kind: 'primary_assistant' },
      system_hints: [],
      supports_buffering: true,
      supported_encodings: ['v1'],
      client_contextual_info: { app_name: 'chatgpt.com' },
      history_and_training_disabled: true,
    }),
  });

  console.log('Conversation status:', convRes.status);
  const convText = await convRes.text();
  if (!convRes.ok) {
    console.error('Error:', convText);
  } else {
    console.log('SUCCESS! Response preview:', convText.substring(0, 300));
  }
}

testChatGPT().catch(console.error);
