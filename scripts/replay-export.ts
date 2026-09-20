process.env.ENABLE_DEMO_CONTROLS ??= "true";
import { exportReplay } from "../src/server/api/actions";
import { verifyToken } from "../src/server/auth/index";

const token = process.env.FUTARI_TOKEN;
const uid = token ? await verifyToken(token) : process.env.DEMO_UID;
const runId = process.argv[2];
if (!uid || !runId) {
  console.error("Usage: FUTARI_TOKEN=... npm run replay:export -- <runId>");
  process.exit(1);
}
const result = await exportReplay(uid, runId);
console.log(result);
