# Voting Module Tests

Validation tests for Snapshot voting wrappers and modules.

## Quick Start

```bash
# Run all tests
pnpm test

# Capture baseline scores for parity testing
POLYGON_RPC=https://your-rpc.com pnpm run baseline:capture
```

## Test Files

| File | Purpose |
|------|---------|
| `snapshot-strategies.test.ts` | Validates existing Polygon wrappers (Voting8, Voting10, V3Pools1) |
| `parity.test.ts` | Verifies modular components match legacy wrappers |
| `algebra-integral.test.ts` | Tests AlgebraIntegralV4Module for Base/Somnia |

## Test Wallets

Test wallets are configured in `config/test-wallets.json` with expected sources:

| Label | Chain | Sources |
|-------|-------|---------|
| `wallet-quick-holder` | Polygon | walletQUICK |
| `staked-dquick` | Polygon | dQUICK |
| `pools-holder` | Polygon | v3Pools |
| `multi-source-holder` | Polygon | dQUICK, syrup |
| `base-holder` | Base | walletQUICK |
| `mainnet-holder` | Ethereum | walletQUICK |

## Configuration Files

```
test/
├── config/
│   └── test-wallets.json     # Test wallets with expected sources
├── fixtures/
│   └── blocks.json           # Fixed blocks for deterministic tests
└── baselines/
    └── baseline-latest.json  # Captured scores for parity checks
```

Core chain config is in `../config/chains.json`.

## Snapshot Playground Validation

Test wrappers in the Snapshot playground before deployment:

**URL**: https://v1.snapshot.box/#/playground/erc20-balance-of

### Strategy Configs

**Voting8** (wallet + dQUICK):
```json
{
  "address": "0x7c87a471abd9bf56d41c752ab7c1b5de91d8dda6",
  "symbol": "QUICK",
  "decimals": 18
}
```

**V3Pools1** (v3 positions):
```json
{
  "address": "0x2fcb66504ea8ee541176662939ef0c53e95c4a19",
  "symbol": "QUICK",
  "decimals": 18
}
```

**Voting10** (syrup staking) - use `pagination` strategy:
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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POLYGON_RPC` | Polygon RPC endpoint | `https://polygon.drpc.org` |
| `BASE_RPC` | Base RPC endpoint | `https://mainnet.base.org` |
| `ETHEREUM_RPC` | Ethereum RPC endpoint | `https://eth.llamarpc.com` |

**Note**: Public RPCs may rate-limit. Use private RPCs for reliable testing.
