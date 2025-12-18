/**
 * Keystore utilities for secure wallet management
 * Password is prompted at runtime, never stored
 * 
 * Uses @ethereumjs/wallet (lightweight, no ethers dependency)
 */
import fs from "fs";
import readline from "readline";
import { Wallet } from "@ethereumjs/wallet";
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

/**
 * Prompt for password with hidden input
 */
export function promptPassword(prompt = "Enter keystore password: "): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    
    let password = "";
    const onData = (char: string) => {
      char = char + "";
      
      switch (char) {
        case "\n":
        case "\r":
        case "\u0004":
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(password);
          break;
        case "\u0003":
          process.exit();
          break;
        case "\u007F": // backspace
          password = password.slice(0, -1);
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          process.stdout.write(prompt + "*".repeat(password.length));
          break;
        default:
          password += char;
          process.stdout.write("*");
          break;
      }
    };
    stdin.on("data", onData);
  });
}

/**
 * Load wallet from encrypted keystore V3
 */
export async function loadKeystoreWallet(keystorePath: string): Promise<Wallet> {
  if (!fs.existsSync(keystorePath)) {
    throw new Error(`Keystore file not found: ${keystorePath}`);
  }

  const keystoreJson = fs.readFileSync(keystorePath, "utf8");
  const password = await promptPassword();

  try {
    const wallet = await Wallet.fromV3(keystoreJson, password);
    return wallet;
  } catch {
    throw new Error("Failed to decrypt keystore. Check your password.");
  }
}

/**
 * Get viem account from keystore
 */
export async function getAccount(): Promise<PrivateKeyAccount> {
  const keystorePath = process.env.KEYSTORE_PATH;
  
  if (!keystorePath) {
    throw new Error(
      "KEYSTORE_PATH not configured.\n" +
      "Set it in your .env file:\n" +
      "  KEYSTORE_PATH=keystores/deployer.json"
    );
  }

  console.log("🔐 Loading encrypted keystore...");
  const wallet = await loadKeystoreWallet(keystorePath);
  console.log("✅ Keystore decrypted");
  
  const address = bytesToHex(wallet.getAddress());
  console.log(`📍 Deployer: ${address}\n`);
  
  const privateKey = bytesToHex(wallet.getPrivateKey()) as `0x${string}`;
  return privateKeyToAccount(privateKey);
}

