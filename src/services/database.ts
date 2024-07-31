import { Schema } from "@effect/schema";
import { Context, Effect, Layer, pipe, Option } from "effect";
import IORedis from "ioredis";
import { AllocationQueryRow } from "./dune.js";
import { REDIS_ALLOCATION_KEY_EXPIRY } from "../constants.js";

const { map, flatMap, tryPromise } = Effect;

class RedisError {
  readonly _tag = "RedisError";
  constructor(public message: string) {}
}

class HydrationError {
  readonly _tag = "HydrationError";
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

export const ExecutionsIndex = Schema.Array(
  Schema.Struct({
    executionId: Schema.String,
    timestamp: Schema.NumberFromString,
  }),
);

export type ExecutionsIndex = Schema.Schema.Type<typeof ExecutionsIndex>;

export const Allocation = Schema.Struct({
  transferVolume: Schema.NumberFromString,
  averageHoldings: Schema.NumberFromString,
});

export type Allocation = Schema.Schema.Type<typeof Allocation>;

class KEYS {
  static readonly LATEST_EXECUTION = "execution:latest";
  static readonly EXECUTION = (id: string) => `execution:${id}`;
  static readonly EXECUTION_INDEX = "index:execution";
  static readonly ALLOCATION = (executionId: string, address: string) =>
    `allocation:${executionId}:${address.toLowerCase()}`;
  static readonly ALLOCATION_TRANSFER_VOLUME = (
    executionId: string,
    address: string,
  ) => `${this.ALLOCATION(executionId, address)}:transfer-volume`;
  static readonly ALLOCATION_AVERAGE_HOLDINGS = (
    executionId: string,
    address: string,
  ) => `${this.ALLOCATION(executionId, address)}:average-holdings`;
  static readonly ALLOCATIONS_IMPORTED = (executionId: string) =>
    `execution:${executionId}:rows-imported`;
}

const redisError = (e: unknown) => new RedisError((e as Error).message);

export class Database extends Context.Tag("Database")<
  Database,
  {
    readonly client: IORedis.Redis;
  }
>() {
  static readonly live = Layer.effect(
    Database,
    pipe(
      Effect.sync(() => new IORedis.Redis(process.env.REDIS_URL!)),
      Effect.orDie,
      map((client) =>
        Database.of({
          client,
        }),
      ),
      Effect.tap((db) =>
        Effect.addFinalizer(() => Effect.sync(() => db.client.disconnect())),
      ),
    ),
  );
}

const getClient = Database.pipe(map((db) => db.client));

const hidrateExecution = (
  value: Option.Option<string>,
): Effect.Effect<Option.Option<Execution>> =>
  pipe(
    Effect.succeed(value),
    flatMap((value) =>
      Effect.try({
        try: () => Option.map(value, (v) => JSON.parse(v) as unknown),
        catch: () => new HydrationError(),
      }),
    ),
    flatMap(
      Option.match({
        onSome: (value) =>
          pipe(value, Schema.decodeUnknown(Execution), Effect.map(Option.some)),
        onNone: () => Effect.succeed(Option.none()),
      }),
    ),
    Effect.matchEffect({
      onSuccess: Effect.succeed,
      onFailure: (e) =>
        pipe(Effect.logError(e), Effect.andThen(Effect.succeed(Option.none()))),
    }),
  );

export const getLatestExecution = getClient.pipe(
  flatMap((client) =>
    pipe(
      tryPromise({
        try: () => client.get(KEYS.LATEST_EXECUTION),
        catch: redisError,
      }),
      map(Option.fromNullable),
      flatMap(hidrateExecution),
    ),
  ),
);

export const getExecution = (id: string) =>
  getClient.pipe(
    flatMap((client) =>
      pipe(
        tryPromise({
          try: () => client.get(KEYS.EXECUTION(id)),
          catch: redisError,
        }),
        map(Option.fromNullable),
        flatMap(hidrateExecution),
      ),
    ),
  );

export const saveLatestExecution = (execution: Execution) =>
  getClient.pipe(
    flatMap((client) =>
      tryPromise({
        try: () => client.set(KEYS.LATEST_EXECUTION, JSON.stringify(execution)),
        catch: redisError,
      }),
    ),
  );

export const saveExecution = (execution: Execution) =>
  getClient.pipe(
    flatMap((client) =>
      tryPromise({
        try: () =>
          client.set(
            KEYS.EXECUTION(execution.executionId),
            JSON.stringify(execution),
          ),
        catch: redisError,
      }),
    ),
  );

export const addExecutionToIndex = (execution: Execution) =>
  getClient.pipe(
    flatMap((client) =>
      tryPromise({
        try: () =>
          client.zadd(
            KEYS.EXECUTION_INDEX,
            execution.timestamp,
            execution.executionId,
          ),
        catch: redisError,
      }),
    ),
  );

export const getExecutions = getClient.pipe(
  flatMap((client) =>
    pipe(
      tryPromise({
        try: () => client.zrevrangebyscore(KEYS.EXECUTION_INDEX, 0, -1),
        catch: redisError,
      }),
      map((result) => {
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
      flatMap(Schema.decodeUnknown(ExecutionsIndex)),
      Effect.catchTag("ParseError", (e) =>
        pipe(e, Effect.logError, Effect.andThen(Effect.succeed([]))),
      ),
    ),
  ),
);

export const saveAllocations = (
  executionId: string,
  allocations: readonly AllocationQueryRow[],
) =>
  getClient.pipe(
    flatMap((client) =>
      tryPromise({
        try: async () => {
          let batch = client.multi();
          allocations.forEach((allocation) => {
            batch = batch
              .setex(
                KEYS.ALLOCATION_AVERAGE_HOLDINGS(
                  executionId,
                  allocation.address,
                ),
                REDIS_ALLOCATION_KEY_EXPIRY,
                allocation.avg_amount_held,
              )
              .setex(
                KEYS.ALLOCATION_TRANSFER_VOLUME(
                  executionId,
                  allocation.address,
                ),
                REDIS_ALLOCATION_KEY_EXPIRY,
                allocation.amount_transferred,
              );
          });
          const responses = await batch.exec();
          if (responses === null) {
            throw new Error("null batch response");
          }
          const errors = responses.map((v) => v[0]).filter((v) => v != null);
          if (errors.length > 0) {
            throw new Error(
              `batch failed [${errors.length} errors] ${errors[0]?.message}`,
            );
          } else {
            return "OK" as const;
          }
        },
        catch: redisError,
      }),
    ),
  );

export const incrementAllocationsImported = (
  executionId: string,
  value: number,
) =>
  getClient.pipe(
    flatMap((client) =>
      tryPromise({
        try: () => client.incrby(KEYS.ALLOCATIONS_IMPORTED(executionId), value),
        catch: redisError,
      }),
    ),
  );

export const resetAllocationsImported = (executionId: string) =>
  getClient.pipe(
    flatMap((client) =>
      tryPromise({
        try: () => client.del(KEYS.ALLOCATIONS_IMPORTED(executionId)),
        catch: redisError,
      }),
    ),
  );

export const getAllocation = (executionId: string, address: string) =>
  getClient.pipe(
    flatMap((client) =>
      Effect.zipWith(
        tryPromise({
          try: () =>
            client.get(KEYS.ALLOCATION_TRANSFER_VOLUME(executionId, address)),
          catch: redisError,
        }),
        tryPromise({
          try: () =>
            client.get(KEYS.ALLOCATION_AVERAGE_HOLDINGS(executionId, address)),
          catch: redisError,
        }),
        (transferVolume, averageHoldings) => {
          return Schema.decodeUnknownOption(Allocation)({
            transferVolume,
            averageHoldings,
          });
        },
      ),
    ),
  );
