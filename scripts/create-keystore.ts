#!/usr/bin/env tsx
/**
 * Create encrypted keystore from private key
 * Usage: pnpm exec tsx scripts/create-keystore.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Wallet } from "@ethereumjs/wallet";
import { promptPassword } from "./utils/keystore.js";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function promptPrivateKey(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Enter private key (without 0x): ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const privateKeyInput = await promptPrivateKey();
  const privateKey = privateKeyInput.replace(/^0x/, "");

  if (!/^[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("Invalid private key format (must be 64 hex characters)");
  }

  const wallet = Wallet.fromPrivateKey(Buffer.from(privateKey, "hex"));
  const addressBuffer = wallet.getAddress();
  const address = `0x${addressBuffer.toString("hex")}`;
  
  console.log(`Address: ${address}`);

  const password = await promptPassword("Choose password: ");
  const confirm = await promptPassword("Confirm: ");

  if (password !== confirm) throw new Error("Passwords do not match");
  if (password.length < 8) throw new Error("Password must be ≥8 characters");

  console.log("Encrypting...");
  const v3Keystore = await wallet.toV3(password);
  const v3String = JSON.stringify(v3Keystore, null, 2);

  const dir = path.join(__dirname, "..", "keystores");
  fs.mkdirSync(dir, { recursive: true });

  const filename = `deployer-${address.slice(0, 10)}.json`;
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, v3String);

  console.log(`✅ Saved: ${filepath}`);
  console.log(`\nAdd to .env:\n  KEYSTORE_PATH=keystores/${filename}`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});

