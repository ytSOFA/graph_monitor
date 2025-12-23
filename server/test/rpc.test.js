import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load RPC endpoints from ../.env (default behavior).
dotenv.config();

// Map logical subgraph names to the actual env var names present in .env
const RPC_ENDPOINTS = [
  ['vault_eth', 'RPC_ETH'],
  ['vault_arb', 'RPC_ARB'],
  ['vault_bsc', 'RPC_BSC'],
  ['vault_pol', 'RPC_POL'],
  ['vault_sei', 'RPC_SEI'],
  ['vault_sep', 'RPC_SEP'],
  ['vault_arbsep', 'RPC_ARBSEP'],
];

function requireRpc(envVar) {
  const url = process.env[envVar];
  console.log(`RPC for ${envVar}: ${url}`);
  assert.ok(url, `Missing RPC endpoint: ${envVar}`);
  return url;
}

for (const [name, envVar] of RPC_ENDPOINTS) {
  test(
    `RPC ${name} (${envVar}) responds with block number`,
    async (t) => {
      const url = requireRpc(envVar);
      const provider = new ethers.JsonRpcProvider(url);
      const blockNumber = await provider.getBlockNumber();
      console.log(`${name} block number: ${blockNumber}`);
      assert.equal(typeof blockNumber, 'number');
    },
    { timeout: 15000 },
  );
}
