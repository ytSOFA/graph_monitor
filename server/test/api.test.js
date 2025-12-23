import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = process.env.TEST_PORT || '4001';
const BASE_URL = `http://localhost:${TEST_PORT}`;

function startServer() {
  // Spawn a dedicated server instance for the test.
  const child = spawn('node', ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: TEST_PORT,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log(`[api.test] spawned server pid=${child.pid} on port ${TEST_PORT}`);
  child.stdout.on('data', (d) => {
    process.stdout.write(`[api.test][server] ${d}`);
  });
  child.stderr.on('data', (d) => {
    process.stderr.write(`[api.test][server-err] ${d}`);
  });
  return child;
}

async function waitForHealth(retries = 120, intervalMs = 500) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch (error) {
      // ignore and retry
    }
    await delay(intervalMs);
  }
  throw new Error('Server health check did not become ready in time');
}

test(
  'API serves health and delays',
  async (t) => {
    const server = startServer();
    t.after(() => server.kill('SIGTERM'));

    await waitForHealth();
    console.log('[api.test] health endpoint is up');

    const health = await fetch(`${BASE_URL}/api/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.status, 'ok');
    console.log('[api.test] /health response:', healthBody);

    const delays = await fetch(`${BASE_URL}/api/delays`);
    assert.equal(delays.status, 200);
    const json = await delays.json();
    assert.equal(typeof json, 'object');
    console.log('[api.test] /api/delays keys:', Object.keys(json).length);

    const count = 1;
    const sliced = await fetch(`${BASE_URL}/api/delays?count=${count}`);
    assert.equal(sliced.status, 200);
    const slicedJson = await sliced.json();
    const checkSeries = (series, label) => {
      if (!Array.isArray(series)) return;
      assert.ok(
        series.length <= count,
        `${label} length ${series.length} exceeds ${count}`,
      );
    };
    for (const [name, subgraph] of Object.entries(slicedJson)) {
      if (!subgraph || typeof subgraph !== 'object') continue;
      checkSeries(subgraph.gateway, `${name}.gateway`);
      checkSeries(subgraph.goldsky, `${name}.goldsky`);
      if (subgraph.indexers && typeof subgraph.indexers === 'object') {
        for (const [idx, series] of Object.entries(subgraph.indexers)) {
          checkSeries(series, `${name}.indexers.${idx}`);
        }
      }
    }
  },
  { timeout: 120000 },
);
