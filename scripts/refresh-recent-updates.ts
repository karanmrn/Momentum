import { createRecentUpdatesService } from "../services/recent-updates.js";
import { createPostgresRecentUpdatesStore } from "../server/recent-updates.js";

const connection =
  process.env.RECENT_UPDATES_DATABASE_URL ||
  process.env.RECENT_UPDATES_DATABASE_URL;
if (!connection)
  throw new Error(
    "RECENT_UPDATES_DATABASE_URL is required for the news refresh.",
  );
const store = createPostgresRecentUpdatesStore(connection);
try {
  const result = await createRecentUpdatesService({ store }).refresh();
  console.log(
    JSON.stringify({
      checkedAt: result.checkedAt,
      status: result.status,
      itemCount: result.items.length,
    }),
  );
  if (result.sources.some((source) => source.status === "failed"))
    process.exitCode = 1;
} catch {
  console.error(
    "The news refresh failed. Check source and database availability.",
  );
  process.exitCode = 1;
} finally {
  await store.close();
}
