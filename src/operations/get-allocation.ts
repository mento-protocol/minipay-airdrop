import { Effect, Option } from "effect";
import { Address } from "../schema.js";
import {
  getLatestExecution,
  getAllocation as getAllocationFromCache,
} from "../services//redis.js";
import { notFound } from "effect-http/HttpError";
import { alloc } from "../utils.js";

export const noAllocation = () => {
  return notFound(JSON.stringify({ error: "no-allocation" }));
};

export const noExecution = () => {
  return notFound(JSON.stringify({ error: "no-latest-execution" }));
};

export const getAllocation = (address: Address) =>
  Effect.gen(function* () {
    const latest = yield* getLatestExecution.pipe(
      Effect.flatMap(
        Option.match({
          onSome: (v) => Effect.succeed(v),
          onNone: () => Effect.fail(noExecution()),
        }),
      ),
    );

    const allocation = yield* getAllocationFromCache(
      latest.executionId,
      address,
    );

    if (Option.isNone(allocation)) {
      return yield* Effect.fail(noAllocation());
    }

    const { transferVolume, averageHoldings } = allocation.value;

    const mentoFromTransfers = Math.min(transferVolume * 0.1, 100);
    const mentoFromHoldings = Math.min(averageHoldings, 100);

    return alloc(
      address,
      mentoFromHoldings,
      mentoFromTransfers,
      latest.timestamp,
    );
  });
