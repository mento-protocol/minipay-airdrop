import {
  Console,
  Effect,
  Match,
  Option,
  pipe,
  Schedule,
  Either,
  Duration,
} from "effect";
import { executeQuery, latestQueryResults } from "../services/dune.js";
import {
  DUNE_AIRDROP_QUERY_ID,
  DUNE_AIRDROP_STATS_QUERY_ID,
  IMPORT_BATCH_SIZE,
} from "../constants.js";
import { getExecution, saveExecution } from "../services/redis.js";
import { LatestQueryResultsResponse, StatsQueryRow } from "../services/dune.js";
import { Schema } from "@effect/schema";
import { createImportTask } from "../services/tasks.js";

const { andThen, flatMap, map, retry, fail, succeed, sleep, tap } = Effect;
const { log } = Console;
const { value, when, orElse } = Match;

export const getAirdropStats = (staleIfOlderThan: Date) =>
  latestQueryResults(DUNE_AIRDROP_STATS_QUERY_ID, 1, 0).pipe(
    flatMap((query) => {
      if (query.execution_started_at.getTime() < staleIfOlderThan.getTime()) {
        return pipe(
          log("Stats are stale, re-execution"),
          andThen(executeQuery(DUNE_AIRDROP_STATS_QUERY_ID)),
          andThen(sleep("1 second")),
          andThen(
            latestQueryResults(DUNE_AIRDROP_STATS_QUERY_ID, 1, 0).pipe(
              flatMap((newQuery) =>
                value(newQuery).pipe(
                  when({ execution_id: query.execution_id }, () =>
                    fail("not-refreshed"),
                  ),
                  orElse((q) => succeed(q)),
                ),
              ),
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
        return succeed(query);
      }
    }),
    map((query) =>
      Either.fromNullable(query.result.rows[0], () => "row-missing"),
    ),
    tap(log),
    map(Either.flatMap(Schema.decodeUnknownEither(StatsQueryRow))),
    tap(log),
    flatMap(
      Either.match({
        onRight: (r) =>
          Effect.succeed({
            block: r.block,
            recipients: r.recipients,
            mentoAllocated: r.total_mento_earned,
          }),
        onLeft: (e) => Effect.die(e), // Very unexpected, we die :(
      }),
    ),
  );

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
    const batches = Math.ceil(
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
    const stats = yield* getAirdropStats(execution.execution_ended_at);
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
    1000,
    0,
  );
  const execution = yield* getExecution(latestDuneExecution.execution_id);
  console.log(latestDuneExecution);
  if (Option.isNone(execution)) {
    yield* startImport(latestDuneExecution);
  } else if (
    execution.value.importFinished === false &&
    Duration.greaterThan(
      Duration.millis(Date.now() - execution.value.timestamp),
      Duration.decode("1 minute"),
    )
  ) {
    yield* startImport(latestDuneExecution);
  }
});
