import { Effect, Option, pipe } from "effect";
import { Address } from "../schema.js";
import {
  getLatestExecution,
  getAllocation as getAllocationFromCache,
} from "../services/database.js";
import { notFound } from "effect-http/HttpError";
import { alloc } from "../utils.js";

const { flatMap, map } = Effect;

export const noAllocation = () => {
  return notFound(JSON.stringify({ error: "no-allocation" }));
};

export const noExecution = () => {
  return notFound(JSON.stringify({ error: "no-latest-execution" }));
};

export const getAllocation = (address: Address) =>
  pipe(
    getLatestExecution,
    flatMap(
      Option.match({
        onSome: Effect.succeed,
        onNone: () => Effect.fail(noExecution()),
      }),
    ),
    flatMap(({ executionId, timestamp }) =>
      pipe(
        getAllocationFromCache(executionId, address),
        Effect.map(Option.map((r) => ({ ...r, timestamp }))),
      ),
    ),
    flatMap(
      Option.match({
        onSome: Effect.succeed,
        onNone: () => Effect.fail(noAllocation()),
      }),
    ),
    map(({ transferVolume, averageHoldings, timestamp }) => {
      const mentoFromTransfers = Math.min(transferVolume * 0.1, 100);
      const mentoFromHoldings = Math.min(averageHoldings, 100);

      return alloc(address, mentoFromHoldings, mentoFromTransfers, timestamp);
    }),
  );
