import { assertOfflineRekeyBoundary } from '../runtimeBoundary.js';

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value == null || value.startsWith('--')) {
      throw new Error('Arguments must be explicit --name value pairs.');
    }
    const name = key.slice(2);
    if (flags[name] != null) throw new Error('Duplicate argument: --' + name);
    if (/key(?!-fd)|credential|ciphertext|secret/i.test(name)) {
      throw new Error('Literal credential or key arguments are forbidden.');
    }
    flags[name] = value;
  }
  return flags;
}

function required(flags: Record<string, string>, name: string): string {
  const value = flags[name]?.trim();
  if (!value) throw new Error('Missing required argument --' + name);
  return value;
}

function integer(flags: Record<string, string>, name: string): number {
  const value = Number(required(flags, name));
  if (!Number.isInteger(value)) throw new Error('--' + name + ' must be an integer');
  return value;
}

try {
  // This assertion must execute before database, bootstrap, server, mail, broker,
  // watcher, or credential-envelope modules are imported.
  assertOfflineRekeyBoundary();
  const flags = parseFlags(process.argv.slice(2));
  const { rekeyOfflineCandidate } = await import('./offlineRekey.js');
  const report = await rekeyOfflineCandidate({
    source: required(flags, 'source'),
    destination: required(flags, 'destination'),
    manifestPath: required(flags, 'manifest'),
    reportPath: required(flags, 'report'),
    expectedBusinessTableCount: integer(flags, 'expected-business-tables'),
    sourceKeyFd: integer(flags, 'source-key-fd'),
    targetKeyFd: integer(flags, 'target-key-fd'),
    expectedSourceKeyIdFd: integer(flags, 'source-id-fd'),
    expectedTargetKeyIdFd: integer(flags, 'target-id-fd'),
  });
  console.log(JSON.stringify(report));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}
