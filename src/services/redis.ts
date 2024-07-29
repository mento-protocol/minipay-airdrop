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
    readonly ZRANGE_WITHSCORES: EffectifyOption<
      RedisClientType["ZRANGE_WITHSCORES"]
    >;
    readonly INCRBY: Effectify<RedisClientType["INCRBY"]>;
  }
>() {
  static readonly live = Layer.effect(
    Redis,
    pipe(
      promise(() =>
        createClient({
          url: process.env.REDIS_URL!,
        }).connect(),
      ),
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
          ZRANGE_WITHSCORES: (...args) =>
            promise(() => client.ZRANGE_WITHSCORES(...args)).pipe(
              map(Option.fromNullable),
            ),
          INCRBY: (...args) => promise(() => client.INCRBY(...args)),
        }),
      ),
      Effect.tap((r) =>
        Effect.addFinalizer(() => promise(() => r.client.disconnect())),
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
    return yield* pipe(
      Effect.succeed(value.value),
      Effect.flatMap((v) => Effect.try(() => JSON.parse(v))),
      Effect.map(Schema.decodeUnknownEither(Execution)),
      Effect.flatMap(
        Either.match({
          onRight: (value) => Effect.succeed(Option.some(value)),
          onLeft: () =>
            redis
              .DEL(`execution:${executionId}`)
              .pipe(Effect.map(() => Option.none())),
        }),
      ),
    );
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

const ExecutionsList = Schema.Array(
  Schema.Struct({
    executionId: Schema.String,
    timestamp: Schema.NumberFromString,
  }),
);

export const getExecutions = () =>
  pipe(
    Redis,
    flatMap((r) =>
      r.ZRANGE_WITHSCORES(`index:execution`, 0, -1, { REV: true }),
    ),
    Effect.map(Schema.decodeUnknownEither(Schema.Array(Schema.Unknown))),
    Effect.map(
      Either.map((result) => {
        const executions: Array<{ executionId: unknown; timestamp: unknown }> =
          [];
        for (let i = 0; i < result.length / 2; i++) {
          executions.push({
            executionId: result[i * 2],
            timestamp: result[i * 2 + 1],
          });
        }
        return executions;
      }),
    ),
    Effect.map(Either.map(Schema.decodeUnknownSync(ExecutionsList))),
    Effect.flatMap(
      Either.match({
        onRight: (v) => Effect.succeed(v),
        onLeft: () => Effect.logError("Could not unmarshall executionIndex"),
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
