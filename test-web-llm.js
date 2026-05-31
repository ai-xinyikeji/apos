#!/usr/bin/env node
/**
 * 测试网页版大模型连接
 * 
 * 使用方法：
 * 1. 确保 APOS 服务正在运行 (npm run dev)
 * 2. 确保已经在设置页面同步了 Cookie
 * 3. 运行: node test-web-llm.js [platform]
 *    - platform: chatgpt | gemini | kimi (默认: kimi)
 * 
 * 示例：
 *   node test-web-llm.js kimi     # 测试 Kimi 网页版
 *   node test-web-llm.js chatgpt  # 测试 ChatGPT 网页版
 *   node test-web-llm.js gemini   # 测试 Gemini 网页版
 */

const http = require('http');

// 从命令行参数获取要测试的平台
const platform = process.argv[2] || 'kimi';

// 平台配置
const PLATFORM_CONFIG = {
  chatgpt: {
    name: 'ChatGPT 网页版',
    settingKey: 'model_task_retrieval',
    settingValue: 'chatgpt_web',
  },
  gemini: {
    name: 'Gemini 网页版',
    settingKey: 'model_task_retrieval',
    settingValue: 'gemini_web',
  },
  kimi: {
    name: 'Kimi 网页版',
    settingKey: 'model_task_retrieval',
    settingValue: 'kimi_web',
  },
};

if (!PLATFORM_CONFIG[platform]) {
  console.log('❌ 不支持的平台:', platform);
  console.log('支持的平台: chatgpt, gemini, kimi');
  process.exit(1);
}

const config = PLATFORM_CONFIG[platform];

// 测试配置
const TEST_CONFIG = {
  host: 'localhost',
  port: 3000,
  timeout: 30000, // 30秒超时
};

// 测试消息
const TEST_MESSAGES = [
  {
    role: 'user',
    content: '你好，请用一句话介绍你自己。'
  }
];

/**
 * 设置数据库配置，强制使用指定的网页版模型
 */
async function setWebModelConfig() {
  console.log(`🔧 配置数据库使用 ${config.name}...`);

  const postData = JSON.stringify({
    key: config.settingKey,
    value: config.settingValue,
  });

  const options = {
    hostname: TEST_CONFIG.host,
    port: TEST_CONFIG.port,
    path: '/api/settings',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ 已配置使用 ${config.name}\n`);
          resolve();
        } else {
          console.log(`⚠️  配置失败 (${res.statusCode}), 继续测试...\n`);
          resolve(); // 即使失败也继续测试
        }
      });
    });

    req.on('error', (error) => {
      console.log('⚠️  配置请求失败:', error.message);
      console.log('继续测试...\n');
      resolve(); // 即使失败也继续测试
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 发送测试请求到 APOS API
 */
async function testWebLLM() {
  console.log('🧪 开始测试网页版大模型连接...\n');

  const postData = JSON.stringify({
    messages: TEST_MESSAGES,
    stream: false,
  });

  const options = {
    hostname: TEST_CONFIG.host,
    port: TEST_CONFIG.port,
    path: '/api/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: TEST_CONFIG.timeout,
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      console.log(`📡 响应状态码: ${res.statusCode}`);
      console.log(`📋 响应头:`, res.headers);
      console.log('');

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const response = JSON.parse(data);
            console.log('✅ 测试成功！');
            console.log('📝 响应内容:');
            console.log(JSON.stringify(response, null, 2));
            resolve(response);
          } else {
            console.log('❌ 测试失败！');
            console.log('错误响应:', data);
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (error) {
          console.log('❌ 解析响应失败:', error.message);
          console.log('原始响应:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ 请求失败:', error.message);
      console.log('\n💡 提示:');
      console.log('  1. 确保 APOS 服务正在运行 (npm run dev)');
      console.log('  2. 确认端口 3000 没有被占用');
      reject(error);
    });

    req.on('timeout', () => {
      console.log('❌ 请求超时 (30秒)');
      console.log('\n💡 提示:');
      console.log('  1. 检查网页版大模型 Cookie 是否有效');
      console.log('  2. 检查网络连接');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 检查 APOS 服务是否运行
 */
async function checkService() {
  return new Promise((resolve) => {
    const req = http.get(`http://${TEST_CONFIG.host}:${TEST_CONFIG.port}/`, (res) => {
      resolve(true);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// 主函数
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  APOS ${config.name}连接测试`);
  console.log('═══════════════════════════════════════════════════════\n');

  // 检查服务是否运行
  console.log('🔍 检查 APOS 服务状态...');
  const isRunning = await checkService();
  
  if (!isRunning) {
    console.log('❌ APOS 服务未运行！');
    console.log('\n💡 请先启动服务:');
    console.log('   cd /Users/clive/Documents/source/cousor/apos');
    console.log('   npm run dev');
    console.log('');
    process.exit(1);
  }

  console.log('✅ APOS 服务正在运行\n');

  // 配置使用网页版模型
  await setWebModelConfig();

  // 执行测试
  try {
    await testWebLLM();
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  测试完成！');
    console.log('═══════════════════════════════════════════════════════');
    process.exit(0);
  } catch (error) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  测试失败！');
    console.log('═══════════════════════════════════════════════════════');
    process.exit(1);
  }
}

// 运行测试
main();
