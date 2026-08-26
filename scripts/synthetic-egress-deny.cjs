'use strict';

const BOUNDARY = 'controlled-synthetic-runtime-handoff-v1';
if (process.env.VTS_RUNTIME_BOUNDARY !== BOUNDARY) {
  throw new Error('[synthetic-egress] preload refused outside the controlled boundary');
}
process.stderr.write('[synthetic-egress] active\n');

const net = require('node:net');
const dgram = require('node:dgram');

const stats = {
  blockedNonLoopback: 0,
  allowedLoopback: 0,
  fetchBlocked: 0,
  socketBlocked: 0,
  datagramBlocked: 0,
};
Object.defineProperty(globalThis, '__VTS_SYNTHETIC_EGRESS_STATS__', {
  value: stats,
  enumerable: false,
  configurable: false,
  writable: false,
});

function normalizedHost(value) {
  return String(value || 'localhost').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isLoopback(host) {
  const value = normalizedHost(host);
  return (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value === '::1' ||
    value === '0:0:0:0:0:0:0:1' ||
    value.startsWith('127.')
  );
}

function blocked(kind) {
  stats.blockedNonLoopback += 1;
  stats[kind] += 1;
  const error = new Error('[synthetic-egress] non-loopback network denied');
  error.code = 'EACCES';
  return error;
}

function socketDestination(args) {
  const first = args[0];
  if (typeof first === 'object' && first !== null) {
    if (first.path != null) return { ipc: true, host: '' };
    return { ipc: false, host: first.host || first.hostname || 'localhost' };
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) {
    return { ipc: true, host: '' };
  }
  return { ipc: false, host: args[1] || 'localhost' };
}

const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function controlledSyntheticSocketConnect(...args) {
  const destination = socketDestination(args);
  if (destination.ipc) return originalSocketConnect.apply(this, args);
  if (!isLoopback(destination.host)) throw blocked('socketBlocked');
  stats.allowedLoopback += 1;
  return originalSocketConnect.apply(this, args);
};

const originalDatagramConnect = dgram.Socket.prototype.connect;
dgram.Socket.prototype.connect = function controlledSyntheticDatagramConnect(...args) {
  const host = args[1] || '127.0.0.1';
  if (!isLoopback(host)) throw blocked('datagramBlocked');
  stats.allowedLoopback += 1;
  return originalDatagramConnect.apply(this, args);
};

const originalDatagramSend = dgram.Socket.prototype.send;
dgram.Socket.prototype.send = function controlledSyntheticDatagramSend(...args) {
  let host = '127.0.0.1';
  for (let index = args.length - 1; index >= 0; index -= 1) {
    if (typeof args[index] === 'string') {
      host = args[index];
      break;
    }
  }
  if (!isLoopback(host)) throw blocked('datagramBlocked');
  stats.allowedLoopback += 1;
  return originalDatagramSend.apply(this, args);
};

if (typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function controlledSyntheticFetch(input, init) {
    let url;
    try {
      url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    } catch {
      return Promise.reject(blocked('fetchBlocked'));
    }
    if (!isLoopback(url.hostname)) return Promise.reject(blocked('fetchBlocked'));
    stats.allowedLoopback += 1;
    return originalFetch.call(this, input, init);
  };
}

let emitted = false;
function emit() {
  if (emitted) return;
  emitted = true;
  process.stderr.write('[synthetic-egress] ' + JSON.stringify(stats) + '\n');
}
process.once('beforeExit', emit);
process.once('exit', emit);
