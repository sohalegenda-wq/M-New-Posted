import { readFileSync, writeFileSync } from "node:fs";
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (
  !databaseId ||
  !/^[0-9a-f-]{36}$/i.test(databaseId) ||
  databaseId === "00000000-0000-0000-0000-000000000000"
)
  throw new Error("Set CLOUDFLARE_D1_DATABASE_ID to the actual D1 UUID");
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
config.d1_databases[0].database_id = databaseId;
writeFileSync("wrangler.jsonc", JSON.stringify(config, null, 2) + "\n");
console.log(
  "D1 binding configured. The database ID is a resource identifier, not a credential.",
);
