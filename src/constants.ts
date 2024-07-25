export const CAMPAIGN_START_BLOCK = 26700546;
export const DUNE_AIRDROP_QUERY_ID = 3932204;
export const DUNE_AIRDROP_STATS_QUERY_ID = 3936853;

export const IMPORT_BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10000");
export const REDIS_INSERT_CONCURRENCY = parseInt(
  process.env.REDIS_INSERT_BATCH_SIZE || "1000",
);
export const DUNE_API_KEY = process.env.DUNE_API_KEY!;
export const GOOGLE_PROJECT = process.env.GOOGLE_PROJECT!;
export const GOOGLE_LOCATION = process.env.GOOGLE_LOCATION!;
export const GOOGLE_TASK_QUEUE = process.env.GOOGLE_TASK_QUEUE!;
export const IMPORT_TASK_URL = process.env.IMPORT_TASK_URL!;
