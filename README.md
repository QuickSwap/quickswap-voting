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

## Deployment

```bash
# Generic deployer (reads config/chains.json)
pnpm exec hardhat run scripts/deploy/chain.ts --network polygon
pnpm exec hardhat run scripts/deploy/chain.ts --network base

# Simple chains (wallet only)
pnpm exec hardhat run scripts/deploy/wallet-quick-only.ts --network ethereum
```

## Configuration

All chain addresses are in [`config/chains.json`](config/chains.json):

- Token addresses (QUICK)
- Contract addresses (Dragon's Lair, Position Manager, etc.)
- Module configuration per chain
- Deployed wrapper addresses

## Snapshot Strategy

```json
{
  "name": "erc20-balance-of",
  "network": "<CHAIN_ID>",
  "params": {
    "address": "<AGGREGATOR_OR_MODULE>",
    "symbol": "QUICK",
    "decimals": 18
  }
}
```

## Testing

```bash
pnpm test                    # All tests
pnpm run baseline:capture    # Capture baseline scores
pnpm run typecheck           # Type check
```

## Admin

Allowlists can be updated without redeployment:

```solidity
// ALM vaults (Gamma, Steer, ICHI)
liquidityManagersModule.addVault(vault);
liquidityManagersModule.setVaults(vaults);

// V2 LP staking pools
v2LPStakingModule.addPool(pool);
v2LPStakingModule.setPools(pools);

// Syrup legacy pools
syrupStakingModule.setLegacyPools(pools);
```

## Monitoring

```bash
pnpm run monitor:limits
```

## License

MIT
