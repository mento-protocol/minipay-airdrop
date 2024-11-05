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
    flatMap((v) => Effect.try(() => Option.getOrThrow(v))),
    Effect.orElseFail(noExecution),
    flatMap((execution) =>
      pipe(
        getAllocationFromCache(execution.executionId, address),
        flatMap((v) => Effect.try(() => Option.getOrThrow(v))),
        Effect.orElseFail(noAllocation),
        Effect.zip(Effect.succeed(execution)),
      ),
    ),  
    map(([{ mento_reward, cusd_reward }, { timestamp }]) =>
      alloc(address, mento_reward, cusd_reward, timestamp),
    ),
  );
