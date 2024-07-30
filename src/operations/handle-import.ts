import { Effect, Option } from "effect";
import { ImportBody } from "../entry/internal.js";
import { Schema } from "@effect/schema";
import { AllocationQueryRow, getExectionResults } from "../services/dune.js";
import {
  getExecution,
  incrementAllocationsImported,
  saveAllocations,
  saveExecution,
  saveLatestExecution,
} from "../services/redis.js";

export const handleImport = (params: ImportBody) =>
  Effect.gen(function* () {
    yield* Effect.log("starting import");
    const execution = yield* getExecution(params.executionId);

    const results = yield* getExectionResults(
      params.executionId,
      params.limit,
      params.offset,
    );

    const rows = Schema.decodeUnknownSync(Schema.Array(AllocationQueryRow))(
      results.result.rows,
    );

    yield* saveAllocations(params.executionId, rows);
    const totalRowsImported = yield* incrementAllocationsImported(
      params.executionId,
      rows.length,
    );

    if (params.batchIndex == 0 && process.env.NODE_ENV == "development") {
      yield* Effect.log("stopping after first batch in development mode");
      yield* saveLatestExecution({
        ...Option.getOrThrow(execution),
        importFinished: true,
      });
      yield* saveExecution({
        ...Option.getOrThrow(execution),
        importFinished: true,
      });
      return;
    }

    if (Option.isSome(execution)) {
      if (totalRowsImported == execution.value.rows) {
        // We've finished the import, yey!
        yield* saveLatestExecution({
          ...execution.value,
          importFinished: true,
        });
        yield* saveExecution({
          ...execution.value,
          importFinished: true,
        });
      }
    } else {
      yield* Effect.fail(
        "Execution not found in redis. This is highly unexpected",
      );
    }
  }).pipe(Effect.annotateLogs(params));
