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
