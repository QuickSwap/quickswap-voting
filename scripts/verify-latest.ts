/**
 * Verify the latest deployment for a chain using hardhat-verify (etherscan subtask).
 *
 * Usage:
 *   pnpm exec tsx scripts/verify-latest.ts polygon
 *
 * Notes:
 * - Reads deployments/<chain>-latest.json (must include constructor args).
 * - Uses the `verify etherscan` subtask to avoid Blockscout/Sourcify noise.
 * - For complex constructor args (e.g. address[]), hardhat-verify expects a CJS module
 *   when using --constructor-args-path. We generate a temporary .cjs file and delete it.
 */

import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

type DeploymentContract = { address: string; name: string; args?: any[] };
type Deployment = {
  chain: string;
  chainId: number;
  contracts: Record<string, DeploymentContract>;
};

function usage(): never {
  console.error("Usage: pnpm exec tsx scripts/verify-latest.ts <chain>");
  process.exit(1);
}

function isComplexArg(arg: unknown): boolean {
  return Array.isArray(arg) || (typeof arg === "object" && arg !== null);
}

function verifyWithInlineArgs(chain: string, address: string, args: any[]) {
  const stringArgs = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a)));
  execFileSync(
    "pnpm",
    ["exec", "hardhat", "verify", "etherscan", "--network", chain, address, ...stringArgs],
    { stdio: "inherit" }
  );
}

function verifyWithArgsFile(chain: string, address: string, args: any[]) {
  const tmpPath = path.join(os.tmpdir(), `quickswap-voting-verify-args-${chain}-${address}.cjs`);
  fs.writeFileSync(tmpPath, `module.exports = ${JSON.stringify(args, null, 2)};\n`, "utf8");
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "hardhat",
        "verify",
        "etherscan",
        "--network",
        chain,
        "--constructor-args-path",
        tmpPath,
        address,
      ],
      { stdio: "inherit" }
    );
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
}

function main() {
  const chain = process.argv[2];
  if (!chain) usage();

  const file = path.join(process.cwd(), "deployments", `${chain}-latest.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Deployment not found: deployments/${chain}-latest.json`);
  }

  const deployment = JSON.parse(fs.readFileSync(file, "utf8")) as Deployment;
  const contracts = Object.values(deployment.contracts);

  // Verify leaf modules first, then aggregator last (best UX when browsing explorer).
  const order = ["Wallet", "Syrup", "Algebra", "Liquidity", "V2", "Aggregator"];
  contracts.sort((a, b) => {
    const ai = order.findIndex((k) => a.name.includes(k));
    const bi = order.findIndex((k) => b.name.includes(k));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  for (const c of contracts) {
    const args = c.args ?? [];
    const needsFile = args.some(isComplexArg);

    console.log(`\n=== Verifying ${c.name} ===`);
    console.log(`Address: ${c.address}`);

    if (needsFile) {
      verifyWithArgsFile(chain, c.address, args);
    } else {
      verifyWithInlineArgs(chain, c.address, args);
    }
  }
}

main();


