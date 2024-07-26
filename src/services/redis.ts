import { Schema } from "@effect/schema";
import { Console, Context, Effect, Either, Layer, Option, pipe } from "effect";
import { AllocationQueryRow } from "./dune.js";
import { createClient, RedisClientType } from "redis";
import { REDIS_INSERT_CONCURRENCY } from "../constants.js";

const { promise, map, flatMap } = Effect;

type EffectifyOption<F> = F extends (
  ...args: infer TArgs
) => Promise<infer TReturn>
  ? (...args: TArgs) => Effect.Effect<Option.Option<NonNullable<TReturn>>>
  : never;

type Effectify<F> = F extends (...args: infer TArgs) => Promise<infer TReturn>
  ? (...args: TArgs) => Effect.Effect<TReturn>
  : never;

export class Redis extends Context.Tag("Redis")<
  Redis,
  {
    readonly client: RedisClientType;
    readonly GET: EffectifyOption<RedisClientType["GET"]>;
    readonly SET: EffectifyOption<RedisClientType["SET"]>;
    readonly MSET: EffectifyOption<RedisClientType["MSET"]>;
    readonly DEL: EffectifyOption<RedisClientType["DEL"]>;
    readonly SCARD: EffectifyOption<RedisClientType["SCARD"]>;
    readonly SADD: EffectifyOption<RedisClientType["SADD"]>;
    readonly SMEMBERS: EffectifyOption<RedisClientType["SMEMBERS"]>;
    readonly ZCARD: EffectifyOption<RedisClientType["ZCARD"]>;
    readonly ZADD: EffectifyOption<RedisClientType["ZADD"]>;
    readonly ZRANGE: EffectifyOption<RedisClientType["ZRANGE"]>;
    readonly INCRBY: Effectify<RedisClientType["INCRBY"]>;
  }
>() {
  static readonly live = Layer.effect(
    Redis,
    pipe(
      promise(() => createClient().connect()),
      Effect.orDie,
      map((client) =>
        Redis.of({
          client: client as RedisClientType,
          GET: (...args) =>
            promise(() => client.GET(...args)).pipe(map(Option.fromNullable)),
          SET: (...args) =>
            promise(() => client.SET(...args)).pipe(map(Option.fromNullable)),
          MSET: (...args) =>
            promise(() => client.MSET(...args)).pipe(map(Option.fromNullable)),
          DEL: (...args) =>
            promise(() => client.DEL(...args)).pipe(map(Option.fromNullable)),
          SCARD: (...args) =>
            promise(() => client.SCARD(...args)).pipe(map(Option.fromNullable)),
          SADD: (...args) =>
            promise(() => client.SADD(...args)).pipe(map(Option.fromNullable)),
          SMEMBERS: (...args) =>
            promise(() => client.SMEMBERS(...args)).pipe(
              map(Option.fromNullable),
            ),
          ZCARD: (...args) =>
            promise(() => client.ZCARD(...args)).pipe(map(Option.fromNullable)),
          ZADD: (...args) =>
            promise(() => client.ZADD(...args)).pipe(map(Option.fromNullable)),
          ZRANGE: (...args) =>
            promise(() => client.ZRANGE(...args)).pipe(
              map(Option.fromNullable),
            ),
          INCRBY: (...args) => promise(() => client.INCRBY(...args)),
        }),
      ),
      Effect.tap((r) =>
        Effect.addFinalizer(() => promise(r.client.disconnect.bind(r.client))),
      ),
    ),
  );
}

export const Execution = Schema.Struct({
  executionId: Schema.String,
  timestamp: Schema.Number,
  importFinished: Schema.Boolean,
  rows: Schema.Number,
  stats: Schema.Struct({
    block: Schema.Number,
    mentoAllocated: Schema.Number,
    recipients: Schema.Number,
  }),
});

export type Execution = Schema.Schema.Type<typeof Execution>;

export const getLatestExecution = pipe(
  Redis,
  flatMap((r) => r.GET("execution:latest")),
  Effect.flatMap(Option.map((r) => JSON.parse(r))),
  Effect.orElseSucceed(() => Option.none),
  Effect.map(Schema.decodeUnknownOption(Execution)),
);

export const saveLatestExecution = (exec: Execution) =>
  pipe(
    Redis,
    Effect.flatMap((r) => r.SET("execution:latest", JSON.stringify(exec))),
  );

export const getExecution = (executionId: string) =>
  Effect.gen(function* () {
    const redis = yield* Redis;
    const value = yield* redis.GET(`execution:${executionId}`);
    if (Option.isNone(value)) {
      return Option.none();
    }
    const result = yield* pipe(
      Effect.succeed(value.value),
      Effect.map((v) => Effect.try(() => JSON.parse(v))),
      Effect.map(Schema.decodeUnknownEither(Execution)),
    );
    if (Either.isRight(result)) {
      return Option.some(result.right);
    } else {
      yield* redis.DEL(`execution:${executionId}`);
      return Option.none();
    }
  });

export const addExecutionToIndex = (exec: Execution) =>
  pipe(
    Redis,
    flatMap((r) =>
      r.ZADD(`index:execution`, {
        score: exec.timestamp,
        value: exec.executionId,
      }),
    ),
  );

const ExecutionIds = Schema.Array(Schema.NumberFromString);

export const getExecutions = () =>
  pipe(
    Redis,
    flatMap((r) => r.ZRANGE(`execution:index`, 0, -1, { REV: true })),
    Effect.map(Schema.decodeUnknownEither(ExecutionIds)),
    Effect.flatMap(
      Either.match({
        onRight: (v) => Effect.succeed(v),
        onLeft: Console.log,
      }),
    ),
  );

export const saveExecution = (exec: Execution) =>
  pipe(
    Redis,
    Effect.flatMap((r) =>
      r.SET(`execution:${exec.executionId}`, JSON.stringify(exec)),
    ),
    Effect.andThen(addExecutionToIndex(exec)),
  );

export const saveAllocations = (
  executionId: string,
  allocations: readonly AllocationQueryRow[],
) =>
  pipe(
    Redis,
    Effect.flatMap((r) =>
      Effect.all(
        allocations.map(
          (allocation) =>
            r.SET(
              `allocation:${executionId}:${allocation.address}`,
              JSON.stringify(allocation),
              {
                EX: 60 * 60 * 24 * 3,
              },
            ),
          { concurrency: REDIS_INSERT_CONCURRENCY },
        ),
      ),
    ),
  );

export const incrementAllocationsImported = (
  executionId: string,
  total: number,
) =>
  pipe(
    Redis,
    Effect.flatMap((r) =>
      r.INCRBY(`execution:${executionId}:rows-imported`, total),
    ),
  );

export const resetAllocationsImported = (executionId: string) =>
  pipe(
    Redis,
    Effect.flatMap((r) => r.DEL(`execution:${executionId}:rows-imported`)),
  );

export const getAllocation = (executionId: string, address: string) =>
  pipe(
    Redis,
    flatMap((r) => r.GET(`allocation:${executionId}:${address.toLowerCase()}`)),
    Effect.tap(Console.log),
    Effect.flatMap(Option.map((r) => JSON.parse(r))),
    Effect.orElseSucceed(() => Option.none),
    Effect.map(Schema.decodeUnknownOption(AllocationQueryRow)),
    Effect.tap(Console.log),
  );
