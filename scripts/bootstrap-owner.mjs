import { execFileSync } from "node:child_process";
const args = process.argv.slice(2);
const userId = args.find((a) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a),
);
if (
  !userId ||
  !args.includes("--confirm") ||
  (!args.includes("--local") && !args.includes("--remote"))
) {
  console.error(
    "Usage: npm run owner -- USER_UUID --local|--remote --confirm\nThis trusted server procedure assigns the FIRST owner only. Register the intended account first; copy its ID from D1. No username matching and no universal credentials.",
  );
  process.exit(1);
}
const sql = `UPDATE user_roles SET role='owner' WHERE user_id='${userId}' AND NOT EXISTS(SELECT 1 FROM user_roles WHERE role='owner') RETURNING user_id,role; INSERT INTO admin_audit_logs(id,actor_id,action,target_id,detail,created_at) SELECT lower(hex(randomblob(16))),NULL,'bootstrap_owner','${userId}','Trusted server CLI',unixepoch()*1000 WHERE EXISTS(SELECT 1 FROM user_roles WHERE user_id='${userId}' AND role='owner') AND NOT EXISTS(SELECT 1 FROM admin_audit_logs WHERE action='bootstrap_owner');`;
execFileSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "m-new-posted",
    args.includes("--remote") ? "--remote" : "--local",
    "--command",
    sql,
  ],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
console.log(
  "Inspect the returned row. Empty output means an owner already exists or the account ID is invalid. Re-login, then open /admin.",
);
