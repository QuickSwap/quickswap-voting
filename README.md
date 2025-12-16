# quickswap-voting

Snapshot voting wrapper contracts for QuickSwap governance.

## Stack

- Hardhat 3.1.0
- viem 2.41
- TypeScript 5.9
- node:test (native Node.js test runner)
- pnpm

## Setup

```bash
pnpm install
```

## Testing

```bash
# Run all tests
pnpm test

# Type checking
pnpm run typecheck

# Security audit
pnpm audit
```

### Test Configuration

- `test/config/chains.json` - Chain configs + wrapper addresses
- `test/config/test-wallets.json` - Test wallets with expected sources
- `test/fixtures/blocks.json` - Fixed blocks for deterministic tests

## Deployment

Set environment variables:

```bash
PRIVATE_KEY=0x...
POLYGON_RPC=https://...
BASE_RPC=https://...
ETH_RPC=https://...
```

Deploy:

```bash
npx hardhat run scripts/deploy-<name>.js --network polygon
```

## Development

See `docs.no-commit/` for:
- Architecture decisions
- TypeScript migration notes
- Validation workflow
- Legacy scoring scripts
