import fs from 'node:fs';
import path from 'node:path';

export const SYNTHETIC_OWNED_CHILD_NAME = 'vts-synthetic-handoff-v1';
export const SYNTHETIC_SENTINEL_NAME = 'SYNTHETIC_ONLY.json';
export const SYNTHETIC_DATABASE_NAME = 'synthetic-handoff.db';
export const SYNTHETIC_REPORT_NAME = 'synthetic-handoff-report.json';
export const SYNTHETIC_SYSTEM_DIRECTORY_NAME = 'lost+found';
export const SYNTHETIC_EXT_FILESYSTEM_MAGIC = 0xef53n;

export const SYNTHETIC_VOLUME_RULES = {
  ROOT_DESCRIPTOR: 'F001_ROOT_DESCRIPTOR',
  ROOT_NAMESPACE: 'F002_ROOT_NAMESPACE',
  SYSTEM_FILESYSTEM: 'F003_SYSTEM_FILESYSTEM',
  SYSTEM_METADATA: 'F004_SYSTEM_METADATA',
  SYSTEM_NOT_EMPTY: 'F005_SYSTEM_NOT_EMPTY',
  CHILD_CREATE: 'F006_CHILD_CREATE',
  CHILD_METADATA: 'F007_CHILD_METADATA',
  NAMESPACE_RACE: 'F008_NAMESPACE_RACE',
  SENTINEL_CREATE: 'F009_SENTINEL_CREATE',
  REPORT_CREATE: 'F010_REPORT_CREATE',
  FINAL_CONTENTS: 'F011_FINAL_CONTENTS',
} as const;

export type SyntheticVolumeRuleCode =
  (typeof SYNTHETIC_VOLUME_RULES)[keyof typeof SYNTHETIC_VOLUME_RULES];

export class SyntheticVolumeFreshnessError extends Error {
  readonly rule: SyntheticVolumeRuleCode;

  constructor(rule: SyntheticVolumeRuleCode) {
    super('Synthetic volume freshness refused [' + rule + ']');
    this.name = 'SyntheticVolumeFreshnessError';
    this.rule = rule;
  }
}

export interface SyntheticStat {
  dev: bigint;
  ino: bigint;
  uid: bigint;
  gid: bigint;
  mode: bigint;
  nlink: bigint;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isFile(): boolean;
}

export interface SyntheticVolumeOperations {
  openDirectory(target: string): number;
  close(fd: number): void;
  fstat(fd: number): SyntheticStat;
  lstat(target: string): SyntheticStat;
  stat(target: string): SyntheticStat;
  statfsType(target: string): bigint;
  list(target: string): Buffer[];
  mkdir(target: string, mode: number): void;
  createExclusive(target: string, contents: string, mode: number): SyntheticStat;
}

function nodeStat(value: fs.BigIntStats): SyntheticStat {
  return value;
}

export function createNodeSyntheticVolumeOperations(): SyntheticVolumeOperations {
  return {
    openDirectory(target) {
      return fs.openSync(
        target,
        fs.constants.O_RDONLY |
          fs.constants.O_DIRECTORY |
          fs.constants.O_NOFOLLOW,
      );
    },
    close(fd) {
      fs.closeSync(fd);
    },
    fstat(fd) {
      return nodeStat(fs.fstatSync(fd, { bigint: true }));
    },
    lstat(target) {
      return nodeStat(fs.lstatSync(target, { bigint: true }));
    },
    stat(target) {
      return nodeStat(fs.statSync(target, { bigint: true }));
    },
    statfsType(target) {
      return fs.statfsSync(target, { bigint: true }).type;
    },
    list(target) {
      return fs.readdirSync(target, { encoding: 'buffer' });
    },
    mkdir(target, mode) {
      fs.mkdirSync(target, { mode, recursive: false });
    },
    createExclusive(target, contents, mode) {
      let fd: number | undefined;
      try {
        fd = fs.openSync(
          target,
          fs.constants.O_WRONLY |
            fs.constants.O_CREAT |
            fs.constants.O_EXCL |
            fs.constants.O_NOFOLLOW,
          mode,
        );
        const data = Buffer.from(contents, 'utf8');
        let written = 0;
        while (written < data.length) {
          written += fs.writeSync(fd, data, written, data.length - written);
        }
        fs.fsyncSync(fd);
        return nodeStat(fs.fstatSync(fd, { bigint: true }));
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    },
  };
}

function mode(value: SyntheticStat): bigint {
  return value.mode & 0o7777n;
}

function sameIdentity(left: SyntheticStat, right: SyntheticStat): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function exactEntries(actual: Buffer[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const remaining = actual.slice();
  for (const name of expected) {
    const expectedBytes = Buffer.from(name, 'utf8');
    const index = remaining.findIndex((entry) => entry.equals(expectedBytes));
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

function closeQuietly(operations: SyntheticVolumeOperations, fd: number | undefined): void {
  if (fd === undefined) return;
  try {
    operations.close(fd);
  } catch {
    // Descriptor cleanup cannot weaken or replace the original refusal.
  }
}

function refuse(rule: SyntheticVolumeRuleCode): never {
  throw new SyntheticVolumeFreshnessError(rule);
}

function normalizeFailure(error: unknown, fallback: SyntheticVolumeRuleCode): never {
  if (error instanceof SyntheticVolumeFreshnessError) throw error;
  refuse(fallback);
}

interface ValidatedSystemDirectory {
  fd: number;
  identity: SyntheticStat;
}

function validateSystemDirectory(
  operations: SyntheticVolumeOperations,
  rootProc: string,
  rootIdentity: SyntheticStat,
  previous?: ValidatedSystemDirectory,
): ValidatedSystemDirectory {
  let opened: number | undefined;
  try {
    if (operations.statfsType(rootProc) !== SYNTHETIC_EXT_FILESYSTEM_MAGIC) {
      refuse(SYNTHETIC_VOLUME_RULES.SYSTEM_FILESYSTEM);
    }
    const target = path.join(rootProc, SYNTHETIC_SYSTEM_DIRECTORY_NAME);
    const linkIdentity = operations.lstat(target);
    if (
      linkIdentity.isSymbolicLink() ||
      !linkIdentity.isDirectory() ||
      linkIdentity.dev !== rootIdentity.dev ||
      linkIdentity.uid !== 0n ||
      linkIdentity.gid !== 0n ||
      mode(linkIdentity) !== 0o700n ||
      linkIdentity.nlink !== 2n
    ) {
      refuse(SYNTHETIC_VOLUME_RULES.SYSTEM_METADATA);
    }
    opened = previous?.fd ?? operations.openDirectory(target);
    const descriptorIdentity = operations.fstat(opened);
    if (
      !sameIdentity(linkIdentity, descriptorIdentity) ||
      !descriptorIdentity.isDirectory() ||
      descriptorIdentity.isSymbolicLink() ||
      descriptorIdentity.dev !== rootIdentity.dev ||
      descriptorIdentity.uid !== 0n ||
      descriptorIdentity.gid !== 0n ||
      mode(descriptorIdentity) !== 0o700n ||
      descriptorIdentity.nlink !== 2n
    ) {
      refuse(SYNTHETIC_VOLUME_RULES.SYSTEM_METADATA);
    }
    if (previous && !sameIdentity(previous.identity, descriptorIdentity)) {
      refuse(SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE);
    }
    if (operations.list('/proc/self/fd/' + opened).length !== 0) {
      refuse(SYNTHETIC_VOLUME_RULES.SYSTEM_NOT_EMPTY);
    }
    return { fd: opened, identity: descriptorIdentity };
  } catch (error) {
    if (!previous) closeQuietly(operations, opened);
    normalizeFailure(error, SYNTHETIC_VOLUME_RULES.SYSTEM_METADATA);
  }
}

function validateCreatedFile(
  stat: SyntheticStat,
  childIdentity: SyntheticStat,
  uid: bigint,
  gid: bigint,
  expectedMode: bigint,
): boolean {
  return (
    stat.isFile() &&
    !stat.isSymbolicLink() &&
    stat.dev === childIdentity.dev &&
    stat.uid === uid &&
    stat.gid === gid &&
    mode(stat) === expectedMode &&
    stat.nlink === 1n
  );
}

export interface SyntheticVolumeClaim {
  readonly configuredDatabaseFile: string;
  readonly databaseFile: string;
  readonly databaseUrl: string;
  writeReportAndValidate(contents: string): void;
  close(): void;
}

export interface SyntheticVolumeClaimOptions {
  mountPath: string;
  configuredDatabaseFile: string;
  sentinelContents: string;
  operations?: SyntheticVolumeOperations;
  effectiveUid?: number;
  effectiveGid?: number;
}

export function claimFreshSyntheticVolume(
  options: SyntheticVolumeClaimOptions,
): SyntheticVolumeClaim {
  const operations = options.operations ?? createNodeSyntheticVolumeOperations();
  const uid = BigInt(options.effectiveUid ?? process.geteuid?.() ?? -1);
  const gid = BigInt(options.effectiveGid ?? process.getegid?.() ?? -1);
  const expectedConfigured = path.join(
    options.mountPath,
    SYNTHETIC_OWNED_CHILD_NAME,
    SYNTHETIC_DATABASE_NAME,
  );
  if (options.configuredDatabaseFile !== expectedConfigured || uid < 0n || gid < 0n) {
    refuse(SYNTHETIC_VOLUME_RULES.ROOT_DESCRIPTOR);
  }

  let rootFd: number | undefined;
  let childFd: number | undefined;
  let system: ValidatedSystemDirectory | undefined;
  let closed = false;
  try {
    rootFd = operations.openDirectory(options.mountPath);
    const rootIdentity = operations.fstat(rootFd);
    const rootProc = '/proc/self/fd/' + rootFd;
    const procIdentity = operations.stat(rootProc);
    const mountIdentity = operations.lstat(options.mountPath);
    if (
      !rootIdentity.isDirectory() ||
      rootIdentity.isSymbolicLink() ||
      !sameIdentity(rootIdentity, procIdentity) ||
      !sameIdentity(rootIdentity, mountIdentity)
    ) {
      refuse(SYNTHETIC_VOLUME_RULES.ROOT_DESCRIPTOR);
    }

    const initialEntries = operations.list(rootProc);
    if (initialEntries.length === 0) {
      // A truly empty mount is valid on any filesystem.
    } else if (
      exactEntries(initialEntries, [SYNTHETIC_SYSTEM_DIRECTORY_NAME])
    ) {
      system = validateSystemDirectory(operations, rootProc, rootIdentity);
    } else {
      refuse(SYNTHETIC_VOLUME_RULES.ROOT_NAMESPACE);
    }

    const childPath = path.join(rootProc, SYNTHETIC_OWNED_CHILD_NAME);
    try {
      operations.mkdir(childPath, 0o700);
    } catch {
      refuse(SYNTHETIC_VOLUME_RULES.CHILD_CREATE);
    }

    const childLinkIdentity = operations.lstat(childPath);
    childFd = operations.openDirectory(childPath);
    const childIdentity = operations.fstat(childFd);
    if (
      childLinkIdentity.isSymbolicLink() ||
      !childLinkIdentity.isDirectory() ||
      !sameIdentity(childLinkIdentity, childIdentity) ||
      !childIdentity.isDirectory() ||
      childIdentity.isSymbolicLink() ||
      childIdentity.dev !== rootIdentity.dev ||
      childIdentity.uid !== uid ||
      childIdentity.gid !== gid ||
      mode(childIdentity) !== 0o700n
    ) {
      refuse(SYNTHETIC_VOLUME_RULES.CHILD_METADATA);
    }

    const expectedRootEntries = system
      ? [SYNTHETIC_SYSTEM_DIRECTORY_NAME, SYNTHETIC_OWNED_CHILD_NAME]
      : [SYNTHETIC_OWNED_CHILD_NAME];
    if (!exactEntries(operations.list(rootProc), expectedRootEntries)) {
      refuse(SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE);
    }
    const rescannedChild = operations.lstat(childPath);
    if (!sameIdentity(rescannedChild, childIdentity)) {
      refuse(SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE);
    }
    if (system) {
      system = validateSystemDirectory(operations, rootProc, rootIdentity, system);
    }

    const childProc = '/proc/self/fd/' + childFd;
    const childProcIdentity = operations.stat(childProc);
    if (!sameIdentity(childIdentity, childProcIdentity)) {
      refuse(SYNTHETIC_VOLUME_RULES.CHILD_METADATA);
    }
    if (operations.list(childProc).length !== 0) {
      refuse(SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE);
    }

    let sentinelStat: SyntheticStat;
    try {
      sentinelStat = operations.createExclusive(
        path.join(childProc, SYNTHETIC_SENTINEL_NAME),
        options.sentinelContents,
        0o600,
      );
    } catch {
      refuse(SYNTHETIC_VOLUME_RULES.SENTINEL_CREATE);
    }
    if (!validateCreatedFile(sentinelStat, childIdentity, uid, gid, 0o600n)) {
      refuse(SYNTHETIC_VOLUME_RULES.SENTINEL_CREATE);
    }
    if (!exactEntries(operations.list(childProc), [SYNTHETIC_SENTINEL_NAME])) {
      refuse(SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE);
    }

    const databaseFile = path.join(childProc, SYNTHETIC_DATABASE_NAME);
    const reportFile = path.join(childProc, SYNTHETIC_REPORT_NAME);

    const validatePinnedNamespaces = (): void => {
      if (!sameIdentity(operations.stat(rootProc), rootIdentity)) {
        refuse(SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE);
      }
      if (!sameIdentity(operations.stat(childProc), childIdentity)) {
        refuse(SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE);
      }
      if (!sameIdentity(operations.lstat(childPath), childIdentity)) {
        refuse(SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE);
      }
      if (!exactEntries(operations.list(rootProc), expectedRootEntries)) {
        refuse(SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE);
      }
      if (system) {
        system = validateSystemDirectory(operations, rootProc, rootIdentity, system);
      }
    };

    return {
      configuredDatabaseFile: options.configuredDatabaseFile,
      databaseFile,
      databaseUrl: 'file:' + databaseFile,
      writeReportAndValidate(contents) {
        try {
          if (closed) refuse(SYNTHETIC_VOLUME_RULES.FINAL_CONTENTS);
          validatePinnedNamespaces();

          let reportStat: SyntheticStat;
          try {
            reportStat = operations.createExclusive(reportFile, contents, 0o600);
          } catch {
            refuse(SYNTHETIC_VOLUME_RULES.REPORT_CREATE);
          }
          if (!validateCreatedFile(reportStat, childIdentity, uid, gid, 0o600n)) {
            refuse(SYNTHETIC_VOLUME_RULES.REPORT_CREATE);
          }

          validatePinnedNamespaces();
          if (
            !exactEntries(operations.list(childProc), [
              SYNTHETIC_SENTINEL_NAME,
              SYNTHETIC_DATABASE_NAME,
              SYNTHETIC_REPORT_NAME,
            ])
          ) {
            refuse(SYNTHETIC_VOLUME_RULES.FINAL_CONTENTS);
          }
          for (const name of [
            SYNTHETIC_SENTINEL_NAME,
            SYNTHETIC_DATABASE_NAME,
            SYNTHETIC_REPORT_NAME,
          ]) {
            const entry = operations.lstat(path.join(childProc, name));
            if (
              !entry.isFile() ||
              entry.isSymbolicLink() ||
              entry.dev !== childIdentity.dev ||
              entry.uid !== uid ||
              entry.gid !== gid ||
              entry.nlink !== 1n
            ) {
              refuse(SYNTHETIC_VOLUME_RULES.FINAL_CONTENTS);
            }
          }
        } catch (error) {
          normalizeFailure(error, SYNTHETIC_VOLUME_RULES.FINAL_CONTENTS);
        }
      },
      close() {
        if (closed) return;
        closed = true;
        closeQuietly(operations, system?.fd);
        closeQuietly(operations, childFd);
        closeQuietly(operations, rootFd);
      },
    };
  } catch (error) {
    closeQuietly(operations, system?.fd);
    closeQuietly(operations, childFd);
    closeQuietly(operations, rootFd);
    normalizeFailure(error, SYNTHETIC_VOLUME_RULES.ROOT_DESCRIPTOR);
  }
}
