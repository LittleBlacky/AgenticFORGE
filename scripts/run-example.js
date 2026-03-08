#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';

const fileName = process.argv[2];
if (!fileName) {
    console.error('Please provide a filename (e.g., ToolExecutor-Search.ts)');
    process.exit(1);
}

const filePath = path.join('./examples', fileName);
execSync(`npx tsx ${filePath}`, { stdio: 'inherit' });