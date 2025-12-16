# Snapshot Strategy Tests

Validation tools for Snapshot voting wrappers.

## Quick Start

```bash
# Sanity checks (CI/CD)
pnpm test

# Capture baseline (before developing new wrappers)
POLYGON_RPC=https://your-rpc.com pnpm run baseline:capture

# Single wallet check
POLYGON_RPC=https://your-rpc.com \
pnpm run baseline:polygon -- \
  0x7106b08ffd3d89794f3ec7bbf56bbba7790d71d6 \
  80438700
```

## Understanding the Tests

**Hardhat tests (`pnpm test`)**:
- ✅ Non-reverting checks
- ✅ Expected sources have balance > 0
- ❌ Does NOT compare exact values (no baseline comparison)

**Baseline capture (`pnpm run baseline:capture`)**:
- Saves scores of all test wallets to JSON
- Use for parity checks when deploying new wrappers

**📚 Full workflow**: See `docs.no-commit/snapshot/VALIDATION-WORKFLOW.md`

## Validation Workflow

### 1. Test in Snapshot Playground

Go to https://v1.snapshot.box/#/playground/erc20-balance-of

**Strategy configs** (use these for each wrapper):

```json
// Voting8 (wallet + dQUICK)
{
  "address": "0x7c87a471abd9bf56d41c752ab7c1b5de91d8dda6",
  "symbol": "QUICK",
  "decimals": 18
}

// V3Pools1 (v3 positions)
{
  "address": "0x2fcb66504ea8ee541176662939ef0c53e95c4a19",
  "symbol": "QUICK",
  "decimals": 18
}
```

For **Voting10** use `pagination` strategy wrapping `erc20-balance-of`:
```json
{
  "symbol": "QUICK",
  "strategies": [{
    "name": "erc20-balance-of",
    "params": {
      "address": "0x59bcc928c513a6a872b7365511ed2a458c4f5d92",
      "decimals": 18
    }
  }]
}
```

Test wallets from `config/test-wallets.json`, block `80438700`

### 2. Compare with Local Script

```bash
# Same wallet, same block
POLYGON_RPC=... node docs.no-commit/snapshot/score-strategies.mjs \
  0x7106b08ffd3d89794f3ec7bbf56bbba7790d71d6 \
  80438700

# Should match Snapshot playground ✅
```

### 3. Deploy New Wrappers

Update `config/chains.json` with new addresses

### 4. Test New Wrappers

Repeat steps 1-2 with new addresses, compare totals

## Configuration

- `config/test-wallets.json` - Test wallets with expected sources
- `config/chains.json` - Chain configs + wrapper addresses  
- `fixtures/blocks.json` - Fixed blocks for deterministic tests
