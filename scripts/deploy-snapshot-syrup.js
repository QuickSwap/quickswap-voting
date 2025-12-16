/* eslint-disable no-console */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

/**
 * Deploy SnapshotSyrupVoting.
 *
 * Env:
 *   <NETWORK>_RPC_URL=<rpc> (see hardhat.config.js)
 *   EITHER:
 *     - PRIVATE_KEY=<deployer pk>
 *   OR:
 *     - KEYSTORE_PATH=<path to keystore json>
 *     - (you will be prompted for the keystore password)
 *
 * Args (preferred via CLI, optional via env):
 *   SYRUP_FACTORY=<address or 0x0>
 *   SYRUP_FACTORY_MAX=<number>
 *   SYRUP_LEGACY_POOLS=<comma-separated addresses>
 *
 * Example:
 *   # Using PRIVATE_KEY:
 *   POLYGON_RPC_URL=... PRIVATE_KEY=... \\
 *   npx hardhat run --network polygon scripts/deploy-snapshot-syrup.js -- \\
 *     --factory 0x... --factoryMax 100 --legacyPools 0xPool1,0xPool2 --id syrup-polygon-v1
 *
 *   # Using keystore:
 *   POLYGON_RPC_URL=... KEYSTORE_PATH=keystores/deployer.json \\
 *   npx hardhat run --network polygon scripts/deploy-snapshot-syrup.js -- \\
 *     --factory 0x... --factoryMax 100 --legacyPools 0xPool1,0xPool2 --id syrup-polygon-v1
 */

function parseAddressList(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const key = k.slice(2);
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = v;
    i++;
  }
  return out;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_e) {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function upsertActiveEntry(doc, entry) {
  const active = Array.isArray(doc.active) ? doc.active : [];
  const id = String(entry.id || "").toLowerCase();
  const next = active.filter((x) => String(x.id || "").toLowerCase() !== id);
  next.push(entry);
  doc.active = next;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  const factory = args.factory || process.env.SYRUP_FACTORY || ethers.constants.AddressZero;
  const factoryMaxRaw = args.factoryMax || process.env.SYRUP_FACTORY_MAX;
  const factoryMax = factoryMaxRaw ? Number(factoryMaxRaw) : 0;
  const legacyPools = parseAddressList(args.legacyPools || process.env.SYRUP_LEGACY_POOLS);
  const id = String(args.id || "snapshot-syrup-v1");

  if (!Number.isFinite(factoryMax) || factoryMax < 0) throw new Error("Invalid SYRUP_FACTORY_MAX");

  const SnapshotSyrupVoting = await ethers.getContractFactory("SnapshotSyrupVoting");
  const c = await SnapshotSyrupVoting.deploy(deployer.address, factory, factoryMax, legacyPools);
  await c.deployed();

  console.log("SnapshotSyrupVoting deployed:", c.address);
  console.log("factory:", factory);
  console.log("factoryMaxPools:", factoryMax);
  console.log("legacyPools:", legacyPools.length);

  const network = await ethers.provider.getNetwork();
  const networkName = (hre.network && hre.network.name) || "unknown";

  const file = path.join(process.cwd(), "deployments", `snapshot-${networkName}.json`);
  const doc =
    readJson(file) || {
      name: `QuickSwap Snapshot Wrappers - ${networkName}`,
      timestamp: new Date().toISOString(),
      version: { major: 1, minor: 0, patch: 0 },
      active: [],
      closed: [],
    };

  doc.timestamp = new Date().toISOString();

  upsertActiveEntry(doc, {
    id,
    contract: "SnapshotSyrupVoting",
    address: c.address,
    ended: false,
    chainId: network.chainId,
    network: networkName,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    txHash: c.deployTransaction && c.deployTransaction.hash ? c.deployTransaction.hash : "",
    params: {
      owner: deployer.address,
      factory,
      factoryMaxPools: factoryMax,
      legacyPools,
    },
  });

  writeJson(file, doc);
  console.log(`saved: ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


