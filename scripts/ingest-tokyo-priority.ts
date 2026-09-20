process.env.ENABLE_DEMO_CONTROLS ??= "true";

import { ingestTokyoPriority } from "../src/server/catalog/ingest";

async function main() {
  const results = await ingestTokyoPriority();
  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
