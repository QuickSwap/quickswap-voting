/**
 * Check Snapshot space settings (strategies) directly from Snapshot Hub.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-snapshot-space.ts
 *   SPACE=quickvote.eth pnpm exec tsx scripts/check-snapshot-space.ts
 *
 * Notes:
 * - Snapshot settings updates are off-chain. A Safe "message" being signed does NOT
 *   guarantee the settings were published to Snapshot Hub.
 */

type Strategy = { name: string; network: string; params: Record<string, unknown> };

const SPACE = process.env.SPACE || "quickvote.eth";
const HUB_URL = process.env.SNAPSHOT_HUB_URL || "https://hub.snapshot.org/graphql";

const query = `
  query Space($id: String!) {
    space(id: $id) {
      id
      name
      network
      strategies {
        name
        network
        params
      }
    }
  }
`;

function shortAddr(v: unknown): string {
  if (typeof v !== "string") return String(v);
  if (!v.startsWith("0x") || v.length < 10) return v;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

async function main() {
  const res = await fetch(HUB_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { id: SPACE } }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Snapshot Hub request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as any;
  if (json.errors?.length) {
    throw new Error(`Snapshot Hub GraphQL error: ${JSON.stringify(json.errors, null, 2)}`);
  }

  const space = json.data?.space as
    | { id: string; name: string; network: string; strategies: Strategy[] }
    | null;
  if (!space) throw new Error(`Space not found: ${SPACE}`);

  console.log(`Space: ${space.name} (${space.id})`);
  console.log(`Default network: ${space.network}`);
  console.log(`Strategies (${space.strategies.length}):`);
  for (const [i, s] of space.strategies.entries()) {
    const addr = (s.params as any)?.address;
    console.log(`  ${i + 1}. ${s.name} (network=${s.network}) address=${addr ? shortAddr(addr) : "n/a"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});




