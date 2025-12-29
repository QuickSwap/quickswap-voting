/**
 * Publish a signed Snapshot Space settings message to Snapshot Hub.
 *
 * This is the missing step when using Safe "Messages": collecting signatures in Safe does NOT
 * automatically broadcast the signed payload to Snapshot Hub.
 *
 * Usage:
 *   pnpm exec tsx scripts/publish-snapshot-settings.ts --file ./space-message.json --sig 0x...
 *
 * Optional:
 *   --hub https://hub.snapshot.org
 *   --space quickvote.eth
 *
 * The JSON file must contain the EIP-712 typed data:
 *   { domain, primaryType, types, message }
 *
 * Notes:
 * - Do NOT re-serialize `message.settings` yourself. It must match exactly what was signed.
 * - For Safe, `--sig` should be the Safe "prepared signature" (concatenated signatures).
 */

type TypedData = {
  domain: { name: string; version: string };
  primaryType: string;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: { from: string; space: string; timestamp: string | number; settings: string };
};

import { getAddress } from "viem";

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new Error(`Hub request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  return json ?? text;
}

async function main() {
  const file = getArg("--file") || process.env.SNAPSHOT_TYPED_DATA_FILE;
  const sig = getArg("--sig") || process.env.SNAPSHOT_SIG;
  const hub = (getArg("--hub") || process.env.SNAPSHOT_HUB || "https://hub.snapshot.org").replace(/\/+$/, "");
  const overrideSpace = getArg("--space") || process.env.SNAPSHOT_SPACE;

  if (!file) {
    throw new Error("Missing --file (or SNAPSHOT_TYPED_DATA_FILE).");
  }
  if (!sig || !sig.startsWith("0x")) {
    throw new Error("Missing --sig (or SNAPSHOT_SIG). Expected 0x-prefixed hex string.");
  }

  const fs = await import("node:fs");
  const raw = fs.readFileSync(file, "utf8");
  const typed = JSON.parse(raw) as TypedData;

  // Normalize without changing semantics:
  // - timestamp must be a number for some encoders; keep value identical.
  const timestamp =
    typeof typed.message.timestamp === "string" ? Number(typed.message.timestamp) : typed.message.timestamp;
  if (!Number.isFinite(timestamp)) throw new Error("Invalid message.timestamp");

  const message = {
    ...typed.message,
    timestamp,
    space: overrideSpace ?? typed.message.space,
  };

  // Snapshot Hub expects EIP-55 checksummed addresses in the envelope.
  // Also normalize message.from to checksum to avoid mismatches.
  const from = getAddress(message.from);
  message.from = from;

  const data = {
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message,
  };

  // Snapshot Hub expects:
  //   { address, sig, data }
  // Where `address` is the signer (Safe address for EIP-1271 verification).
  const payload = {
    address: from,
    sig,
    data,
  };

  console.log("Publishing to Snapshot Hub…");
  console.log("  hub:", hub);
  console.log("  space:", message.space);
  console.log("  from:", message.from);
  console.log("  api:", `${hub}/api/msg`);

  const result = await postJson(`${hub}/api/msg`, payload);
  console.log("\n✅ Hub response:");
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));

  console.log("\nNext: verify with:");
  console.log("  pnpm exec tsx scripts/check-snapshot-space.ts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


