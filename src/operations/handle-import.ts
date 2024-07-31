import { Effect, Option, pipe } from "effect";
import { ImportBody } from "../entry/internal.js";
import { Schema } from "@effect/schema";
import { AllocationQueryRow, getExectionResults } from "../services/dune.js";
import { Database, Execution } from "../services/database.js";

const { flatMap, map, andThen, zipWith } = Effect;

export const finalizeImportIfFinished = ({
  totalRowsImported,
  execution,
}: {
  totalRowsImported: number;
  execution: Execution;
}) => {
  if (
    process.env.NODE_ENV == "development" || // Short-circuit on development
    totalRowsImported == execution.rows
  ) {
    return Database.pipe(
      flatMap((db) =>
        pipe(
          Effect.log("finished import"),
          andThen(
            db.saveLatestExecution({
              ...execution,
              importFinished: true,
            }),
          ),
          andThen(
            db.saveExecution({
              ...execution,
              importFinished: true,
            }),
          ),
        ),
      ),
    );
  } else {
    return Effect.succeed("OK" as const);
  }
};

export const handleImport = (params: ImportBody) =>
  Database.pipe(
    flatMap((db) =>
      pipe(
        db.getExecution(params.executionId),
        flatMap(
          Option.match({
            onSome: Effect.succeed,
            onNone: () =>
              Effect.die(
                "Execution not found in redis. This is highly unexpected",
              ),
          }),
        ),
        zipWith(
          getExectionResults(
            params.executionId,
            params.limit,
            params.offset,
          ).pipe(
            map((v) => v.result.rows),
            map(Schema.decodeUnknownSync(Schema.Array(AllocationQueryRow))),
          ),
          (execution, rows) => ({ execution, rows }),
        ),
        flatMap((data) =>
          zipWith(
            db.saveAllocations(params.executionId, data.rows),
            db.incrementAllocationsImported(
              params.executionId,
              data.rows.length,
            ),
            (_, totalRowsImported) => ({ ...data, totalRowsImported }),
          ),
        ),
        flatMap(finalizeImportIfFinished),
        Effect.annotateLogs(params),
      ),
    ),
  );
