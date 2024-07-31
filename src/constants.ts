import { Option, pipe } from "effect";
import { Schema } from "@effect/schema";

const numberFromEnv = (key: string, defaultValue: number) =>
  pipe(
    process.env[key],
    Schema.decodeUnknownOption(Schema.NumberFromString),
    Option.getOrElse(() => defaultValue),
  );

export const IMPORT_BATCH_SIZE = numberFromEnv("BATCH_SIZE", 10000);
export const REDIS_INSERT_CONCURRENCY = numberFromEnv(
  "REDIS_INSERT_CONCURRENCY",
  100,
);
export const REDIS_ALLOCATION_KEY_EXPIRY = numberFromEnv(
  "REDIS_ALLOCATION_KEY_EXPIRY",
  60 * 60 * 24 * 3,
);

export const CAMPAIGN_START_BLOCK = 26700546;
export const DUNE_AIRDROP_QUERY_ID = 3932204;
export const DUNE_AIRDROP_STATS_QUERY_ID = 3936853;

export const DUNE_API_KEY = process.env.DUNE_API_KEY!;
export const GOOGLE_PROJECT = process.env.GOOGLE_PROJECT!;
export const GOOGLE_LOCATION = process.env.GOOGLE_LOCATION!;
export const GOOGLE_TASK_QUEUE = process.env.GOOGLE_TASK_QUEUE!;
export const IMPORT_TASK_URL = process.env.IMPORT_TASK_URL!;
export const DUNE_API_BASE_URL = "https://api.dune.com/api";
