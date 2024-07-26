import { Effect, Option } from "effect";
import { ImportBody } from "../entry/internal.js";
import { Schema } from "@effect/schema";
import { AllocationQueryRow, getExectionResults } from "../services/dune.js";
import {
  getExecution,
  incrementAllocationsImported,
  saveAllocations,
  saveLatestExecution,
} from "../services/redis.js";

export const handleImport = (params: ImportBody) =>
  Effect.gen(function* () {
    yield* Effect.log("starting import");
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
    const execution = yield* getExecution(params.executionId);

    if (Option.isSome(execution)) {
      if (totalRowsImported == execution.value.rows) {
        // We've finished the import, yey!
        yield* saveLatestExecution({
          ...execution.value,
          importFinished: true,
        });
      }
    } else {
      return Effect.fail(
        "Execution not found in redis. This is highly unexpected",
      );
    }
    return Effect.succeedNone;
  }).pipe(Effect.annotateLogs(params));
