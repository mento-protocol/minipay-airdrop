import { Effect, Match, Option, pipe } from "effect";
import { ImportBody } from "../entry/internal.js";
import { Schema } from "@effect/schema";
import { AllocationQueryRow, getExectionResults } from "../services/dune.js";
import {
  Execution,
  getExecution,
  incrementAllocationsImported,
  saveAllocations,
  saveExecution,
  saveLatestExecution,
} from "../services/database.js";
import { MAX_MENTO_ALLOCATION } from "../constants.js";

const { flatMap, map, andThen, zipWith, zip, succeed, log } = Effect;

export const finalizeImportIfFinished = ({
  totalRowsImported,
  execution,
}: {
  totalRowsImported: number;
  execution: Execution;
}) => {
  if (
    process.env.FORCE_SINGLE_BATCH == "true" || // Short-circuit on development
    totalRowsImported == execution.rows
  ) {
    return pipe(
      zip(
        saveLatestExecution({
          ...execution,
          importFinished: true,
        }),
        saveExecution({
          ...execution,
          importFinished: true,
        }),
        { concurrent: true },
      ),
      andThen(log("finished import")),
      andThen(
        pipe(
          Match.value(execution),
          Match.when(
            {
              stats: (stats) => stats.mentoAllocated >= MAX_MENTO_ALLOCATION,
            },
            () =>
              pipe(
                log("airdrop maximum allocation met"),
                Effect.annotateLogs({
                  timestamp: execution.timestamp,
                  mentoAllocated: execution.stats.mentoAllocated,
                }),
              ),
          ),
          Match.orElse(() => succeed("OK" as const)),
        ),
      ),
    );
  } else {
    return succeed("OK" as const);
  }
};

export const handleImport = (params: ImportBody) =>
  pipe(
    getExecution(params.executionId),
    flatMap(
      Option.match({
        onSome: Effect.succeed,
        onNone: () =>
          Effect.die("Execution not found in redis. This is highly unexpected"),
      }),
    ),
    zipWith(
      getExectionResults(params.executionId, params.limit, params.offset).pipe(
        map((v) => v.result.rows),
        map(Schema.decodeUnknownSync(Schema.Array(AllocationQueryRow))),
      ),
      (execution, rows) => ({ execution, rows }),
    ),
    flatMap((data) =>
      zipWith(
        saveAllocations(params.executionId, data.rows),
        incrementAllocationsImported(params.executionId, data.rows.length),
        (_, totalRowsImported) => ({ ...data, totalRowsImported }),
      ),
    ),
    flatMap(finalizeImportIfFinished),
    Effect.tapError(Effect.logError),
    Effect.annotateLogs(params),
  );
