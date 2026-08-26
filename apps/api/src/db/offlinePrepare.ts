import { assertOfflineRehearsalBoundary } from '../runtimeBoundary.js';

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
  // Fail before importing database libraries or any application runtime module.
  assertOfflineRehearsalBoundary();
  const command = process.argv[2];
  const flags = parseFlags(process.argv.slice(3));
  const tools = await import('./offlineMigration.js');

  if (command === 'prepare') {
    const report = await tools.prepareOfflineCandidate({
      source: required(flags, 'source'),
      destination: required(flags, 'destination'),
      manifestPath: required(flags, 'manifest'),
      reportPath: required(flags, 'report'),
      from: integer(flags, 'from'),
      to: integer(flags, 'to'),
      destinationCredentialKeyId: required(flags, 'destination-key-id'),
    });
    console.log(JSON.stringify(report));
  } else if (command === 'migrate-only') {
    const result = await tools.migrateOnlyDatabase({
      database: required(flags, 'database'),
      from: integer(flags, 'from'),
      to: integer(flags, 'to'),
    });
    console.log(JSON.stringify(result));
  } else {
    throw new Error('Command must be prepare or migrate-only.');
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}
