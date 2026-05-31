/**
 * APOS CLI Helper for TypeScript execution
 * 
 * Used by bin/cli.js to execute typescript-based commands like config and index.
 */

import { writeClaudeCodeConfig, getClaudeCodeConfigPaths } from './claude-config-generator';
import { indexRepository } from '../lib/rag';
import path from 'path';
import fs from 'fs';
import os from 'os';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'config') {
    const configPath = path.join(os.homedir(), '.claude', 'claude_desktop_config.json');
    console.log(`Writing Claude Code MCP configuration to ${configPath}...`);
    const result = writeClaudeCodeConfig(configPath, /* turbopackIgnore: true */ process.cwd());
    if (result.success) {
      console.log(`✅ Success: ${result.message}`);
    } else {
      console.error(`❌ Error: ${result.message}`);
      process.exit(1);
    }
  } else if (command === 'index') {
    const targetPath = args[1] ? path.resolve(args[1]) : /* turbopackIgnore: true */ process.cwd();
    console.log(`Indexing workspace at ${targetPath}...`);
    try {
      const count = await indexRepository(async (msg) => {
        console.log(`[Index] ${msg}`);
      });
      console.log(`✅ Success: Workspace indexed. Added/updated ${count} chunks.`);
    } catch (err: any) {
      console.error(`❌ Indexing failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
