/**
 * Verify AlgebraV3Module on Polygonscan
 * 
 * Usage:
 *   pnpm exec tsx scripts/verify-algebra-v3.ts
 * 
 * Requires:
 *   - POLYGONSCAN_API_KEY in .env
 *   - Contract deployed at address in config/chains.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "config", "chains.json");

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const polygonConfig = config.chains.polygon;

const algebraV3Address = polygonConfig.deployed?.algebraV3;

if (!algebraV3Address) {
  console.error("❌ AlgebraV3 module not deployed (check config/chains.json)");
  process.exit(1);
}

const quick = polygonConfig.tokens.QUICK;
const positionManager = polygonConfig.contracts.nonfungiblePositionManager;
const farmingCenter = polygonConfig.contracts.farmingCenter;
const poolDeployer = polygonConfig.contracts.poolDeployer;

console.log("🔍 Verifying AlgebraV3Module on Polygonscan");
console.log(`   Address: ${algebraV3Address}`);
console.log("");

const command = [
  "pnpm exec hardhat verify",
  "--network polygon",
  algebraV3Address,
  quick,
  positionManager,
  farmingCenter,
  poolDeployer,
].join(" ");

console.log(`Running: ${command}\n`);

try {
  execSync(command, { stdio: "inherit" });
  console.log("\n✅ Verification complete");
} catch (e) {
  console.error("\n❌ Verification failed");
  process.exit(1);
}
