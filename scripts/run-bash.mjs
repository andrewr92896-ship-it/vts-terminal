#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [, , script, ...args] = process.argv;

if (!script) {
  console.error('Usage: node scripts/run-bash.mjs <script> [args...]');
  process.exit(2);
}

function windowsGitBash() {
  const candidates = [
    process.env.GIT_BASH,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    process.env['ProgramFiles(x86)'] &&
      path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
  ];

  try {
    const gitPaths = execFileSync('where.exe', ['git'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);

    for (const gitPath of gitPaths) {
      const parent = path.dirname(path.dirname(gitPath));
      candidates.push(path.join(parent, 'bin', 'bash.exe'));
    }
  } catch {
    // The standard install locations above still cover a normal Git for Windows setup.
  }

  return candidates.find((candidate) => candidate && existsSync(candidate));
}

const isWindows = process.platform === 'win32';
const bash = isWindows ? windowsGitBash() : 'bash';

if (!bash) {
  console.error(
    'Git Bash was not found. Install Git for Windows or set GIT_BASH to bash.exe.',
  );
  process.exit(1);
}

const result = spawnSync(bash, [...(isWindows ? ['--login'] : []), script, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Could not start Bash: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
