import { Option, pipe } from "effect";
import { Schema } from "@effect/schema";

export const numberFromEnv = (key: string, defaultValue?: number) =>
  pipe(
    process.env[key],
    Schema.decodeUnknownOption(Schema.NumberFromString),
    defaultValue ? Option.getOrElse(() => defaultValue) : Option.getOrThrow,
  );

export const stringFromEnv = (key: string, defaultValue?: string) =>
  pipe(
    process.env[key],
    Option.fromNullable,
    defaultValue ? Option.getOrElse(() => defaultValue) : Option.getOrThrow,
  );

export const IMPORT_BATCH_SIZE = numberFromEnv("BATCH_SIZE", 10000);
export const CAMPAIGN_START_BLOCK = 26700546;
export const DUNE_AIRDROP_QUERY_ID = 4223307;
export const DUNE_AIRDROP_STATS_QUERY_ID = 4223321;
export const DUNE_API_BASE_URL = "https://api.dune.com/api";
export const MAX_MENTO_ALLOCATION = BigInt(10_000_000) * BigInt(1e18);
