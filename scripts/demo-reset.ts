process.env.ENABLE_DEMO_CONTROLS ??= "true";
import { demoReset } from "../src/server/api/actions";
import { verifyToken } from "../src/server/auth/index";

const token = process.env.FUTARI_TOKEN;
const uid = token ? verifyToken(token) : process.env.DEMO_UID;
if (!uid) {
  console.error("Set FUTARI_TOKEN or DEMO_UID");
  process.exit(1);
}
const result = await demoReset(uid, true);
console.log(result);
