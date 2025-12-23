import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { request, gql } from 'graphql-request';
import { ethers } from 'ethers';
import cron from 'node-cron';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'subgraphs_delay.json');
const MAX_ENTRIES = Number(process.env.MAX_ENTRIES || 168);
const CRON_EXPRESSION = process.env.CRON_EXPRESSION || '0 * * * *'; // every 60 minutes
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
// Use GRAPH_API_KEY1 for days 1-15, otherwise GRAPH_API_KEY2
const API_KEY =
  new Date().getDate() <= 15
    ? process.env.GRAPH_API_KEY1
    : process.env.GRAPH_API_KEY2;
const HEADERS = { Authorization: `Bearer ${API_KEY}` };
const INDEXER_LIST_ENDPOINT = 'https://gateway.thegraph.com/api/subgraphs/id/DZz4kDTdmzWLWsV373w2bSmoar3umKKH9y82SUKr5qmp';

if (!API_KEY) {
  console.error('GRAPH_API_KEY1/GRAPH_API_KEY2 is required in .env');
  process.exit(1);
}

const SUBGRAPHS = {
  vault_eth: {
    rpcEnv: 'RPC_ETH',
    gateway: {
      url: '5Po2c7F3DiGty1pCRpsDF9yURbpapiWXmkw9ckbafLqe',
      id: 'Qmd5SLvoiTMtYqm2wRt6gBtw2ZjPLcVMuSp7GYmG5j7Xwu',
    },
    goldsky: 'https://api.goldsky.com/api/public/project_cmb4sxp3h0hwr01wyab3mecd7/subgraphs/sofa-vaults-ethereum/0.1.0/gn',
  },
  vault_arb: {
    rpcEnv: 'RPC_ARB',
    gateway: {
      url: 'HcQUG7TbdiSUpsNd4QxJ54iAHvD4TjmkUxsTfkgFdhmC',
      id: 'Qmf4WHN69xmMdkQaZfUpr2Xw1ZpWyRc2jcRJMpCWNJ7uLu',
    },
    goldsky: 'https://api.goldsky.com/api/public/project_cmakhh04kshjj01yhgyz7d09h/subgraphs/sofa-vaults-arbdelprune/0.0.9/gn',
  },
  vault_bsc: {
    rpcEnv: 'RPC_BSC',
    gateway: {
      url: '88UgiNTsJjJ15V1GXTRnUxJBza3ZsrYZyUdAiVuRwQbX',
      id: 'QmWSWPwdg3XucjotHmRhjaL4gvFKpqfsqB6DbgxwKWjVMv',
    },
    goldsky: 'https://api.goldsky.com/api/public/project_cmd5q582zgi9z01vy9wppebhy/subgraphs/sofa-bsc/0.0.4/gn',
  },
  vault_pol: {
    rpcEnv: 'RPC_POL',
    gateway: {
      url: '5AyRj7tY5HsXznUBCQMKuVbbdcBXQfSRQ5K77wMBwER1',
      id: 'QmQe6Tq8Cu4Sjs8f2KQSiLF3bHtyFEydr8uZemKCM9gWEU',
    },
    goldsky: 'https://api.goldsky.com/api/public/project_cmb4sxp3h0hwr01wyab3mecd7/subgraphs/sofa-vaults-polygon/0.0.1/gn',
  },
  vault_sei: {
    rpcEnv: 'RPC_SEI',
    gateway: {
      url: '9NTKYrnPsZASfbe8gx55ZqmViWLwEZNArbkQbC6cXRVb',
      id: 'QmfEgnyee5Za7HuKEuyUrB9w7ApJqUwj9Zau7gxSYPzyk3',
    },
    goldsky: 'https://api.goldsky.com/api/public/project_cmb8ummwjbjyw01vuayl1htoo/subgraphs/sofa-vaults-sei/0.0.5/gn',
  },
  automator_eth: {
    rpcEnv: 'RPC_ETH',
    gateway: {
      url: 'Ao7xxFupmSqH8imXCCLKK8KJnBwkMrTrkGtFfP78Mqr',
      id: 'QmSwAsLBWAijEjZp4tuUYijZSabzvrC7m3rDFs7rZH2YoN',
    },
    goldsky: 'https://api.goldsky.com/api/public/project_cmct3rsxpgyyu01vde3uf8vsf/subgraphs/sofa-automator-eth/0.0.2/gn',
  },
  automator_arb: {
    rpcEnv: 'RPC_ARB',
    gateway: {
      url: '7DKnoe1Hqek8BWrmMFKJF6RfNTH9z8th7yHqM7MCYjCt',
      id: 'QmNfWNrezFH2uQgCcaFfgjQKpSPt3L2RLfEXhAhpodq1iM',
    },
    goldsky: 'https://api.goldsky.com/api/public/project_cmcsj7rm8gglt01yqfeon9rhl/subgraphs/sofa-automator-arb/0.0.4/gn',
  },
  automator_sei: {
    rpcEnv: 'RPC_SEI',
    gateway: {
      url: 'AGRtw68ga8TPco3XHMU4maVRPZ9csK3WVgqoMwbYLsn3',
      id: 'Qma3AhPXrjeFvirqPfJUWfuKCVPK651UJvFaDADZi5DdpX',
    },
    goldsky: 'https://api.goldsky.com/api/public/project_cmct4vidclk8z01v73z7613hi/subgraphs/sofa-automator-sei/0.0.2/gn',
  },
  vault_sep: {
    rpcEnv: 'RPC_SEP',
    goldsky: 'https://api.goldsky.com/api/public/project_cmcoj4hoy0u6u01vy0m284wa8/subgraphs/sofa-sepolia/0.0.3/gn',
  },
  vault_arbsep: {
    rpcEnv: 'RPC_ARBSEP',
    goldsky: 'https://api.goldsky.com/api/public/project_cmcve41bo9mg201vu8vom2mkx/subgraphs/sofa-arbsepdel/0.1.2/gn',
  },
  automator_arbsep: {
    rpcEnv: 'RPC_ARBSEP',
    goldsky: 'https://api.goldsky.com/api/public/project_cmcve41bo9mg201vu8vom2mkx/subgraphs/sofa-automator-arbsep/0.0.5/gn',
  },
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
}

function loadData() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('Failed to read data file, starting fresh:', error);
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function appendEntry(series = [], timestamp, delay) {
  const updated = [...series, { timestamp, delay }];
  if (updated.length > MAX_ENTRIES) {
    updated.splice(0, updated.length - MAX_ENTRIES);
  }
  return updated;
}

function getRpc(envVar) {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`Missing RPC endpoint for ${envVar}`);
  }
  return value;
}

async function getIndexersList(deploymentId) {
  const query = gql`
    {
      subgraphDeployments(where: { ipfsHash: "${deploymentId}" }) {
        indexerAllocations(where: { status: Active }) {
          indexer { id }
        }
      }
    }
  `;
  const data = await request(INDEXER_LIST_ENDPOINT, query, {}, HEADERS);
  const allocations = data.subgraphDeployments?.[0]?.indexerAllocations || [];
  return allocations.map((allocation) => allocation.indexer.id);
}

async function getDelay(provider, endpoint) {
  const query = gql`
    {
      _meta {
        block { number }
      }
    }
  `;
  try {
    const [latestBlock, meta] = await Promise.all([
      provider.getBlockNumber(),
      request(endpoint, query, {}, HEADERS),
    ]);
    const subgraphBlock = meta?._meta?.block?.number;
    if (typeof subgraphBlock !== 'number') {
      throw new Error('Invalid _meta.block.number');
    }
    return Math.max(latestBlock - subgraphBlock, 0);
  } catch (error) {
    console.error(`Delay fetch failed for ${endpoint}:`, error.message);
    return `error: ${error.message}`;
  }
}

async function collectSubgraphSnapshot(name, config, existingIndexers) {
  const provider = new ethers.JsonRpcProvider(getRpc(config.rpcEnv));
  const timestamp = Math.floor(Date.now() / 1000);

  let indexerAddresses = [];
  let indexerListError = null;

  if (config.gateway?.id) {
    try {
      indexerAddresses = await getIndexersList(config.gateway.id);
    } catch (error) {
      indexerListError = error;
      console.error(`Indexer list fetch failed for ${name}:`, error.message);
      indexerAddresses = Object.keys(existingIndexers || {});
    }
  }

  const gatewayDelay = config.gateway
    ? await getDelay(
        provider,
        `https://gateway.thegraph.com/api/subgraphs/id/${config.gateway.url}`,
      )
    : undefined;

  const goldskyDelay = config.goldsky
    ? await getDelay(provider, config.goldsky)
    : undefined;

  const indexerDelays = {};
  for (const indexer of indexerAddresses) {
    const endpoint = `https://gateway.thegraph.com/api/deployments/id/${config.gateway.id}/indexers/id/${indexer}`;
    indexerDelays[indexer] = await getDelay(provider, endpoint);
  }

  return { timestamp, gatewayDelay, goldskyDelay, indexerDelays, indexerAddresses, indexerListError };
}

function applySnapshot(data, name, snapshot) {
  const previous = data[name] || { gateway: [], goldsky: [], indexers: {} };
  const next = { gateway: [], goldsky: [], indexers: {} };

  if (snapshot.gatewayDelay !== undefined) {
    next.gateway = appendEntry(previous.gateway, snapshot.timestamp, snapshot.gatewayDelay);
  }
  if (snapshot.goldskyDelay !== undefined) {
    next.goldsky = appendEntry(previous.goldsky, snapshot.timestamp, snapshot.goldskyDelay);
  }

  const allowedIndexers = snapshot.indexerAddresses || Object.keys(previous.indexers || {});
  for (const idx of allowedIndexers) {
    const priorSeries = previous.indexers?.[idx] || [];
    const delayValue = snapshot.indexerDelays[idx];
    if (delayValue !== undefined) {
      next.indexers[idx] = appendEntry(priorSeries, snapshot.timestamp, delayValue);
    } else if (snapshot.indexerListError) {
      next.indexers[idx] = priorSeries; // keep old data if we couldn't refresh
    }
  }

  data[name] = next;
}

async function runOnce() {
  console.log(`[${new Date().toISOString()}] Starting delay collection...`);
  const data = loadData();
  const timestamp = Math.floor(Date.now() / 1000);

  for (const [name, config] of Object.entries(SUBGRAPHS)) {
    try {
      const snapshot = await collectSubgraphSnapshot(
        name,
        config,
        data[name]?.indexers,
      );
      // enforce shared timestamp across all subgraphs
      snapshot.timestamp = timestamp;
      applySnapshot(data, name, snapshot);
    } catch (error) {
      console.error(`Failed to collect delays for ${name}:`, error.message);
    }
  }

  saveData(data);
  console.log(`[${new Date().toISOString()}] Updated ${DATA_FILE}`);
}

let jobRunning = false;
async function guardedRun() {
  if (jobRunning) {
    console.warn('Previous run still in progress, skipping this tick');
    return;
  }
  jobRunning = true;
  try {
    await runOnce();
  } finally {
    jobRunning = false;
  }
}

const runOnceOnly = process.argv.includes('--once');

// initial run
await guardedRun();

// schedule hourly job unless explicitly running once
if (!runOnceOnly) {
  cron.schedule(CRON_EXPRESSION, () => {
    void guardedRun();
  });

  // Minimal HTTP server for frontend consumption
  const app = express();

  // Serve latest delay data
  app.get('/api/delays', async (_req, res) => {
    try {
      ensureDataFile();
      const body = await fs.promises.readFile(DATA_FILE, 'utf8');
      res
        .status(200)
        .set({
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        })
        .send(body || '{}');
    } catch (error) {
      console.error('HTTP /api/delays error:', error);
      res.status(500).json({ error: 'failed to read data file' });
    }
  });

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  app.listen(PORT, HOST, () => {
    console.log(`Listening on http://${HOST}:${PORT}`);
  });
} else {
  process.exit(0);
}

export { runOnce };
