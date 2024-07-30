import { Effect, Option, pipe, Schedule, Either, Duration } from "effect";
import { executeQuery, latestQueryResults } from "../services/dune.js";
import {
  DUNE_AIRDROP_QUERY_ID,
  DUNE_AIRDROP_STATS_QUERY_ID,
  IMPORT_BATCH_SIZE,
} from "../constants.js";
import {
  getExecution,
  resetAllocationsImported,
  saveExecution,
} from "../services/redis.js";
import { LatestQueryResultsResponse, StatsQueryRow } from "../services/dune.js";
import { Schema } from "@effect/schema";
import { createImportTask } from "../services/tasks.js";
import { serviceUnavailable } from "effect-http/HttpError";

const { andThen, flatMap, retry, fail, sleep } = Effect;

const failIfSameExecution =
  (executionId: string) => (query: LatestQueryResultsResponse) =>
    Effect.gen(function* () {
      if (query.execution_id == executionId) {
        yield* Effect.log("query hasn't finised, retrying...");
        yield* fail("not-refreshed");
      }
      return query;
    });

export const getAirdropStats = (staleIfOlderThan: Date) =>
  Effect.gen(function* () {
    let stats = yield* latestQueryResults(DUNE_AIRDROP_STATS_QUERY_ID, 1, 0);
    if (stats.execution_started_at.getTime() < staleIfOlderThan.getTime()) {
      yield* Effect.log("Stats query is stale, reexcuting");
      stats = yield* pipe(
        executeQuery(DUNE_AIRDROP_STATS_QUERY_ID),
        andThen(sleep("1 second")),
        andThen(
          pipe(
            latestQueryResults(DUNE_AIRDROP_STATS_QUERY_ID, 1, 0),
            flatMap(failIfSameExecution(stats.execution_id)),
            retry({
              while: (e) => e == "not-refreshed",
              schedule: Schedule.addDelay(
                Schedule.recurs(5),
                () => "1 seconds",
              ),
            }),
          ),
        ),
      );
    } else {
      yield* Effect.log("Stats are not stale");
    }

    return pipe(
      Either.fromNullable(stats.result.rows[0], () => "row-missing"),
      Either.flatMap(Schema.decodeUnknownEither(StatsQueryRow)),
      Either.map((r) => ({
        block: r.block,
        recipients: r.recipients,
        mentoAllocated: r.total_mento_earned,
      })),
      Either.getOrThrow,
    );
  });

const scheduleBatch = (
  execution: LatestQueryResultsResponse,
  batchIndex: number,
) =>
  Effect.gen(function* () {
    const batchOptions = {
      executionId: execution.execution_id,
      batchIndex,
      offset: IMPORT_BATCH_SIZE * batchIndex,
      limit: IMPORT_BATCH_SIZE,
    };
    yield* createImportTask(batchOptions);
  });

const scheduleImportTasks = (execution: LatestQueryResultsResponse) =>
  Effect.gen(function* () {
    const batches =
      process.env.NODE_ENV == "development"
        ? 1
        : Math.ceil(
            execution.result.metadata.total_row_count / IMPORT_BATCH_SIZE,
          );

    yield* Effect.all(
      [...Array.from(Array(batches)).keys()].map((batchIndex) =>
        scheduleBatch(execution, batchIndex),
      ),
    );
  });

const startImport = (execution: LatestQueryResultsResponse) =>
  Effect.gen(function* () {
    yield* resetAllocationsImported(execution.execution_id);
    const stats = yield* getAirdropStats(execution.execution_ended_at);
    yield* Effect.log(`saving execution: ${execution.execution_id}`);
    yield* saveExecution({
      executionId: execution.execution_id,
      timestamp: execution.execution_ended_at.getTime(),
      importFinished: false,
      rows: execution.result.metadata.total_row_count,
      stats,
    });
    yield* scheduleImportTasks(execution);
  });

export const handleRefresh = Effect.gen(function* () {
  const latestDuneExecution = yield* latestQueryResults(
    DUNE_AIRDROP_QUERY_ID,
    1,
    0,
  );
  const execution = yield* getExecution(latestDuneExecution.execution_id);
  if (Option.isNone(execution)) {
    yield* startImport(latestDuneExecution);
  } else if (
    execution.value.importFinished === false &&
    Duration.greaterThan(
      Duration.millis(Date.now() - execution.value.timestamp),
      Duration.decode("30 minutes"),
    )
  ) {
    yield* startImport(latestDuneExecution);
  } else {
    yield* serviceUnavailable();
  }
});
