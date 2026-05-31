#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(PROJECT_DIR, 'data', 'server.pid');
const LOG_FILE = path.join(PROJECT_DIR, 'data', 'server.log');

// Ensure data directory exists
if (!fs.existsSync(path.join(PROJECT_DIR, 'data'))) {
  fs.mkdirSync(path.join(PROJECT_DIR, 'data'), { recursive: true });
}

const args = process.argv.slice(2);
const command = args[0] || 'status';

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

if (command === 'start') {
  if (fs.existsSync(PID_FILE)) {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (isRunning(oldPid)) {
      console.log(`AI Product OS is already running on PID ${oldPid}.`);
      console.log(`Access it at: http://localhost:3000`);
      process.exit(0);
    }
  }

  console.log('Starting AI Product OS in the background...');
  
  // Open log file stream
  const logStream = fs.openSync(LOG_FILE, 'a');

  // Spawn Next.js server (npm run dev)
  const child = spawn('npm', ['run', 'dev'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', logStream, logStream]
  });

  // Write PID
  fs.writeFileSync(PID_FILE, child.pid.toString(), 'utf8');
  child.unref();

  console.log(`\nAI Product OS started successfully!`);
  console.log(`- PID: ${child.pid}`);
  console.log(`- Local URL: http://localhost:3000`);
  console.log(`- Log file: ${LOG_FILE}`);
} 

else if (command === 'stop') {
  if (!fs.existsSync(PID_FILE)) {
    console.log('AI Product OS is not running (no PID file found).');
    process.exit(0);
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  if (!isRunning(pid)) {
    console.log(`AI Product OS is not running (PID ${pid} is inactive). Cleaning up stale PID file.`);
    fs.unlinkSync(PID_FILE);
    process.exit(0);
  }

  console.log(`Stopping AI Product OS (PID ${pid})...`);
  try {
    // Kill the process group (using negative PID kills the process group in Unix)
    process.kill(-pid, 'SIGINT');
  } catch (e) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      console.error(`Failed to stop process group: ${err.message}`);
    }
  }

  // Double check and remove PID file
  setTimeout(() => {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
    console.log('AI Product OS stopped successfully.');
  }, 1000);
} 

else if (command === 'status') {
  if (!fs.existsSync(PID_FILE)) {
    console.log('AI Product OS status: STOPPED');
    process.exit(0);
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  if (isRunning(pid)) {
    console.log(`AI Product OS status: RUNNING (PID ${pid})`);
    console.log(`Access it at: http://localhost:3000`);
  } else {
    console.log(`AI Product OS status: STOPPED (stale PID ${pid} cleaned up)`);
    fs.unlinkSync(PID_FILE);
  }
}

else if (command === 'mcp') {
  console.log('Starting APOS MCP Server on stdio...');
  const serverPath = path.join(PROJECT_DIR, 'src', 'mcp', 'server.ts');
  const child = spawn('npx', ['tsx', serverPath], {
    cwd: PROJECT_DIR,
    stdio: 'inherit'
  });
  
  child.on('close', (code) => {
    process.exit(code);
  });
}

else if (command === 'config') {
  const helperPath = path.join(PROJECT_DIR, 'src', 'mcp', 'cli-helper.ts');
  const child = spawn('npx', ['tsx', helperPath, 'config'], {
    cwd: PROJECT_DIR,
    stdio: 'inherit'
  });
  
  child.on('close', (code) => {
    process.exit(code);
  });
}

else if (command === 'index') {
  const targetPath = args[1] || process.cwd();
  const helperPath = path.join(PROJECT_DIR, 'src', 'mcp', 'cli-helper.ts');
  const child = spawn('npx', ['tsx', helperPath, 'index', targetPath], {
    cwd: PROJECT_DIR,
    stdio: 'inherit'
  });
  
  child.on('close', (code) => {
    process.exit(code);
  });
}

else {
  console.log('Usage: apos [start|stop|status|mcp|config|index]');
}
