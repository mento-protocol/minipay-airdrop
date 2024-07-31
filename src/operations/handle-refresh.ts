import {
  Effect,
  Option,
  pipe,
  Schedule,
  Either,
  Duration,
  Match,
} from "effect";
import { executeQuery, latestQueryResults } from "../services/dune.js";
import {
  DUNE_AIRDROP_QUERY_ID,
  DUNE_AIRDROP_STATS_QUERY_ID,
  IMPORT_BATCH_SIZE,
} from "../constants.js";
import { Database } from "../services/database.js";
import { LatestQueryResultsResponse, StatsQueryRow } from "../services/dune.js";
import { Schema } from "@effect/schema";
import { createImportTask } from "../services/tasks.js";
import { serviceUnavailable } from "effect-http/HttpError";

const { andThen, flatMap, retry, fail, sleep, map, tap } = Effect;
const { when, orElse, whenAnd, value } = Match;

const queryStatsUntilExecutionChanges = (executionId: string) =>
  pipe(
    latestQueryResults(DUNE_AIRDROP_STATS_QUERY_ID, 1, 0),
    flatMap((query) =>
      Match.value(query).pipe(
        when(
          {
            execution_id: executionId,
          },
          () => fail("not-refreshed"),
        ),
        orElse(() => Effect.succeed(query)),
      ),
    ),
    retry({
      while: (e) => e == "not-refreshed",
      schedule: Schedule.addDelay(Schedule.recurs(5), () => "1 seconds"),
    }),
  );

export const getAirdropStats = (staleIfOlderThan: Date) =>
  pipe(
    latestQueryResults(DUNE_AIRDROP_STATS_QUERY_ID, 1, 0),
    flatMap((stats) =>
      Match.value(stats).pipe(
        when(
          {
            execution_started_at: (v) =>
              v.getTime() < staleIfOlderThan.getTime(),
          },
          (stats) =>
            pipe(
              Effect.log("Stats query is stale, reexcuting"),
              andThen(executeQuery(DUNE_AIRDROP_STATS_QUERY_ID)),
              andThen(sleep("1 second")),
              andThen(queryStatsUntilExecutionChanges(stats.execution_id)),
            ),
        ),
        orElse((result) => Effect.succeed(result)),
      ),
    ),
    map((stats) =>
      pipe(
        Either.fromNullable(stats.result.rows[0], () => "row-missing"),
        Either.flatMap(Schema.decodeUnknownEither(StatsQueryRow)),
        Either.map((r) => ({
          block: r.block,
          recipients: r.recipients,
          mentoAllocated: r.total_mento_earned,
        })),
        Either.getOrThrow,
      ),
    ),
  );

const scheduleImportTasks = (duneExecution: LatestQueryResultsResponse) =>
  pipe(
    Effect.succeed(
      // Number of batches
      process.env.NODE_ENV == "development"
        ? 1 // Single batch on development
        : Math.ceil(
            duneExecution.result.metadata.total_row_count / IMPORT_BATCH_SIZE,
          ),
    ),
    Effect.flatMap((batches) =>
      Effect.all(
        [...Array.from(Array(batches)).keys()].map((batchIndex) =>
          createImportTask({
            executionId: duneExecution.execution_id,
            batchIndex,
            offset: IMPORT_BATCH_SIZE * batchIndex,
            limit: IMPORT_BATCH_SIZE,
          }),
        ),
      ),
    ),
  );

const startImport = (duneExecution: LatestQueryResultsResponse) =>
  Database.pipe(
    flatMap((db) =>
      pipe(
        pipe(
          db.resetAllocationsImported(duneExecution.execution_id),
          andThen(getAirdropStats(duneExecution.execution_ended_at)),
          tap(Effect.log(`saving execution: ${duneExecution.execution_id}`)),
          flatMap((stats) =>
            db.saveExecution({
              executionId: duneExecution.execution_id,
              timestamp: duneExecution.execution_ended_at.getTime(),
              importFinished: false,
              rows: duneExecution.result.metadata.total_row_count,
              stats,
            }),
          ),
          andThen(scheduleImportTasks(duneExecution)),
        ),
      ),
    ),
  );

export const handleRefresh = Database.pipe(
  flatMap((db) =>
    pipe(
      latestQueryResults(DUNE_AIRDROP_QUERY_ID, 1, 0),
      flatMap((duneExecution) =>
        db
          .getExecution(duneExecution.execution_id)
          .pipe(map((cacheExecution) => ({ duneExecution, cacheExecution }))),
      ),
      flatMap(({ cacheExecution, duneExecution }) =>
        Option.match(cacheExecution, {
          onNone: () => startImport(duneExecution),
          onSome: (execution) =>
            pipe(
              value(execution),
              whenAnd(
                { importFinished: true },
                {
                  timestamp: (timestamp) =>
                    Duration.greaterThan(
                      Duration.millis(Date.now() - timestamp),
                      Duration.decode("30 minutes"),
                    ),
                },
                () => startImport(duneExecution),
              ),
              orElse(() => Effect.fail(serviceUnavailable())),
            ),
        }),
      ),
    ),
  ),
);
