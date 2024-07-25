import { Effect, Option } from "effect";
import { Address } from "../schema.js";
import {
  getLatestExecution,
  getAllocation as getAllocationFromCache,
} from "../db/redis.js";
import { notFound } from "effect-http/HttpError";
import { alloc } from "../utils.js";

export const getAllocation = (address: Address) =>
  Effect.gen(function* () {
    const latest = yield* getLatestExecution.pipe(
      Effect.flatMap(
        Option.match({
          onSome: (v) => Effect.succeed(v),
          onNone: () => Effect.fail(notFound("no-latest-execution")),
        }),
      ),
    );
    const allocation = yield* getAllocationFromCache(
      latest.executionId,
      address,
    );

    if (Option.isSome(allocation)) {
      const mentoFromTransfers = Math.min(
        allocation.value.amount_transferred * 0.1,
        100,
      );
      const mentoFromHoldings = Math.min(allocation.value.avg_amount_held, 100);
      return Effect.succeed(
        alloc(
          allocation.value.address,
          mentoFromHoldings,
          mentoFromTransfers,
          latest.timestamp,
        ),
      );
    } else {
      return Effect.fail(notFound("no-allocation"));
    }
  });
