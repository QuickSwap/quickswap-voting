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

### Deploy Contracts

```bash
# Full chain deployment (aggregator + modules)
pnpm exec hardhat run scripts/deploy/chain.ts --network polygon
pnpm exec hardhat run scripts/deploy/chain.ts --network base

# Wallet-only chains
pnpm exec hardhat run scripts/deploy/wallet-quick-only.ts --network ethereum
```

Deployment artifacts saved to `deployments/<chain>-<timestamp>.json`

### Important: Owner Address

By default, contracts deploy with owner: `0xDA1077c4b0dd6da1BDF166F30aa4BDbF517d637b`

**For production, set your Safe multisig as owner:**

```bash
OWNER_ADDRESS=0xYourSafeAddress pnpm exec hardhat run scripts/deploy/chain.ts --network polygon
```

Or configure in `.env`:

```bash
OWNER_ADDRESS=0xYourSafeMultisigAddress
```

### Optional: Custom Configuration

Configure `.env` for custom settings:

```bash
# Use private RPC (recommended for production)
POLYGON_RPC=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY

# For contract verification
POLYGONSCAN_API_KEY=your_api_key

# Custom keystore path
KEYSTORE_PATH=keystores/deployer.json
```

### Optional: Pre-Deployment Validation

Validate configuration before deploying:

```bash
pnpm exec tsx scripts/check-deployment-ready.ts <chain>
```

### Verify Contracts

```bash
pnpm exec hardhat verify --network polygon <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

Requires `POLYGONSCAN_API_KEY` in `.env`

### Post-Deployment

1. **Test in Snapshot Playground:** https://v1.snapshot.box/#/playground/erc20-balance-of
2. **Compare scores** against existing wrappers (if replacing)
3. **Configure allowlists** via Safe multisig (if deployed empty):

   ```bash
   pnpm exec tsx scripts/generate-safe-txs.ts <chain>
   ```

4. **Update Snapshot space** config after validation

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

## Admin Operations

Allowlists can be updated post-deployment via Safe multisig:

```solidity
// ALM vaults (Gamma, Steer, ICHI)
liquidityManagersModule.setVaults(address[] vaults);

// V2 LP staking pools
v2LPStakingModule.setPools(address[] pools);

// Syrup legacy pools
syrupStakingModule.setLegacyPools(address[] pools);
```

Generate Safe transaction JSON:

```bash
pnpm exec tsx scripts/generate-safe-txs.ts <chain>
# Import output to Safe Transaction Builder
```

## License

MIT
