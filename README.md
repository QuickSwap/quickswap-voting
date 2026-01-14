# QuickSwap Voting

Snapshot voting power wrappers for QuickSwap governance.

## Architecture

![Architecture](assets/architecture.png)

## Modules

| Module | Chains | Description |
|--------|--------|-------------|
| `WalletAndDQuickModule` | Polygon | Wallet QUICK + Dragon's Lair |
| `WalletQuickModule` | Base, Eth, Manta | Wallet QUICK only |
| `SyrupStakingModule` | Polygon | Syrup pools (factory + legacy) |
| `AlgebraV3Module` | Polygon | Algebra V3 LP positions |
| `AlgebraIntegralV4Module` | Base | Algebra v4 LP positions |
| `LiquidityManagersModule` | All | ALM vaults (Gamma, Steer, ICHI) |
| `V2LPStakingModule` | All | V2 LP staking pools |

## Quick Start

```bash
pnpm install
pnpm exec hardhat compile
pnpm test
```

## Configuration

All configuration is in [`config/chains.json`](config/chains.json) (single source of truth).

### Keystore Setup

```bash
pnpm exec tsx scripts/create-keystore.ts

# Add to .env:
KEYSTORE_PATH=keystores/deployer-0x<address>.json
```

## Deployment

### Deployment outputs

- **Source of truth**: `config/chains.json`
- **Local backups**: `deployments/*.json` (gitignored)

### Full Chain Deployment

Deploys all modules + aggregator:

```bash
pnpm exec hardhat run scripts/deploy/chain.ts --network polygon
pnpm exec hardhat run scripts/deploy/chain.ts --network base
```

### Redeploy Aggregator Only

Reuses existing modules, only deploys new aggregator:

```bash
pnpm exec hardhat run scripts/deploy/redeploy-aggregator.ts --network polygon
pnpm exec hardhat run scripts/deploy/redeploy-aggregator.ts --network base
```

### Wallet-Only Chains

```bash
pnpm exec hardhat run scripts/deploy/wallet-quick-only.ts --network ethereum
```

### Owner Address

Default owner: `0xDA1077c4b0dd6da1BDF166F30aa4BDbF517d637b`

Override with your Safe multisig:

```bash
OWNER_ADDRESS=0xYourSafe pnpm exec hardhat run scripts/deploy/chain.ts --network polygon
```

### Verification

```bash
pnpm exec hardhat verify --network <chain> <ADDRESS> <ARGS>
```

## Snapshot Strategy

```json
{
  "name": "erc20-balance-of",
  "network": "<CHAIN_ID>",
  "params": {
    "address": "<AGGREGATOR_ADDRESS>",
    "symbol": "QUICK",
    "decimals": 18
  }
}
```

Get the aggregator address from `config/chains.json` → `chains.<chain>.deployed.aggregator`.

## Project Structure

```
quickswap-voting/
├── config/           # Configuration (JSON)
│   └── chains.json   # Single source of truth for all chain configs
├── contracts/        # Solidity contracts
│   ├── aggregators/  # Chain-specific aggregator contracts
│   ├── modules/      # Voting power modules
│   └── mocks/        # Mock contracts for testing
├── lib/              # Shared TypeScript code
│   └── abis/         # Centralized ABI definitions
│       ├── common.ts    # ERC20, balanceOf, Dragon's Lair
│       ├── aggregator.ts # Aggregator ABIs per chain
│       ├── algebra.ts   # NFT Position Manager, Pool, Factory
│       ├── syrup.ts     # Staking Rewards Factory
│       └── index.ts     # Re-exports all ABIs
├── scripts/          # CLI scripts (deployment, validation, admin)
├── test/             # Tests
│   ├── integration/  # Integration tests (require RPC)
│   └── utils/        # Test utilities
└── deployments/      # Local deployment artifacts (gitignored)
```

## Available Scripts

### 🔍 Validation & Debugging

| Script | Purpose | Usage |
|--------|---------|-------|
| `check-voting-power.ts` | Analyze voting power breakdown for any user | `pnpm exec tsx scripts/check-voting-power.ts <address> [--chain <polygon\|base>]` |
| `check-aggregator-module.ts` | Verify which modules are connected to aggregator | `pnpm exec tsx scripts/check-aggregator-module.ts [--chain <polygon\|base>]` |
| `check-config.ts` | Validate chains.json configuration | `pnpm exec tsx scripts/check-config.ts` |
| `check-deployment-ready.ts` | Pre-deployment checklist validator | `pnpm exec tsx scripts/check-deployment-ready.ts [chain]` |
| `check-snapshot-space.ts` | Show current Snapshot Hub settings | `pnpm exec tsx scripts/check-snapshot-space.ts` |
| `check-syrup-module-status.ts` | Inspect syrup staking module state | `pnpm exec tsx scripts/check-syrup-module-status.ts` |
| `inspect-positions.ts` | Debug Algebra positions in detail | `pnpm exec tsx scripts/inspect-positions.ts <address>` |

### 🧪 Integration Tests (Manual)

| Script | Purpose | Usage |
|--------|---------|-------|
| `test/integration/strategies.test.ts` | Test all Snapshot strategies | `pnpm exec tsx test/integration/strategies.test.ts` |
| `test/integration/algebra-modules.test.ts` | Verify Algebra V3/V4 math correctness | `pnpm exec tsx test/integration/algebra-modules.test.ts` |

### 📝 Verification

| Script | Purpose | Usage |
|--------|---------|-------|
| `verify-latest.ts` | Verify latest deployed contract | `pnpm exec tsx scripts/verify-latest.ts` |
| `verify-algebra-v3.ts` | Verify AlgebraV3Module on Polygonscan | `pnpm exec tsx scripts/verify-algebra-v3.ts` |

### 🔧 Admin Tools

| Script | Purpose | Usage |
|--------|---------|-------|
| `generate-safe-txs.ts` | Generate Safe transaction JSON for allowlist updates | `pnpm exec tsx scripts/generate-safe-txs.ts <chain>` |
| `update-aggregator-module.ts` | Generate Safe tx to update aggregator modules | `pnpm exec tsx scripts/update-aggregator-module.ts` |
| `create-keystore.ts` | Create encrypted keystore for deployment | `pnpm exec tsx scripts/create-keystore.ts` |
| `publish-snapshot-settings.ts` | Publish Snapshot settings via Safe signature | See below |
| `test/utils/capture-baseline.ts` | Capture baseline scores for regression testing | `pnpm exec tsx test/utils/capture-baseline.ts [block]` |

### 📊 Monitoring

| Script | Purpose | Usage |
|--------|---------|-------|
| `monitor-pool-limits.ts` | Monitor factory pool enumeration limits | `pnpm exec tsx scripts/monitor-pool-limits.ts` |

## Debugging Snapshot Settings

To confirm what Snapshot Hub currently has stored for a space:

```bash
pnpm exec tsx scripts/check-snapshot-space.ts
SPACE=quickvote.eth pnpm exec tsx scripts/check-snapshot-space.ts
```

## Publishing Snapshot Settings (Safe)

When using Safe multi-sig, Snapshot space updates are signed as a Safe “message”, but the signed payload still needs to be broadcast to Snapshot Hub.

1) Save the typed-data JSON you signed (the object with `domain`, `types`, `primaryType`, `message`) to a file, e.g. `space-message.json`.

2) Publish it using the Safe prepared signature:

```bash
pnpm exec tsx scripts/publish-snapshot-settings.ts --file ./space-message.json --sig 0x<preparedSignature>
```

3) Verify it’s live:

```bash
pnpm exec tsx scripts/check-snapshot-space.ts
```

## Testing

```bash
pnpm test
```

## Admin Operations

Update allowlists via Safe multisig:

```solidity
liquidityManagersModule.setVaults(address[] vaults);
v2LPStakingModule.setPools(address[] pools);
syrupStakingModule.setLegacyPools(address[] pools);
```

Generate Safe transaction JSON:

```bash
pnpm exec tsx scripts/generate-safe-txs.ts <chain>
```

## License

MIT
