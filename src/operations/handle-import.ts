import { Effect, Option } from "effect";
import { getExectionResults } from "../dune/client.js";
import { ImportBody } from "../functions/internal.js";
import { Schema } from "@effect/schema";
import { AllocationQueryRow } from "../dune/api.js";
import {
  getExecution,
  incrementAllocationsImported,
  saveAllocations,
  saveLatestExecution,
} from "../db/redis.js";

export const handleImport = (params: ImportBody) =>
  Effect.gen(function* () {
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
    console.log(execution);
    console.log(totalRowsImported);
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
  });
