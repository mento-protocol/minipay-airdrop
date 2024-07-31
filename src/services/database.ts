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
    readonly getLatestExecution: Effect.Effect<
      Option.Option<Execution>,
      RedisError
    >;
    readonly getExecution: (
      executionId: string,
    ) => Effect.Effect<Option.Option<Execution>, RedisError>;
    readonly saveExecution: (
      execution: Execution,
    ) => Effect.Effect<"OK", RedisError>;
    readonly saveLatestExecution: (
      execution: Execution,
    ) => Effect.Effect<"OK", RedisError>;
    readonly addExecutionToIndex: (
      execution: Execution,
    ) => Effect.Effect<number, RedisError>;
    readonly getExecutions: Effect.Effect<ExecutionsIndex, RedisError>;
    readonly saveAllocations: (
      executionId: string,
      allocations: readonly AllocationQueryRow[],
    ) => Effect.Effect<"OK", RedisError>;
    readonly incrementAllocationsImported: (
      executionId: string,
      value: number,
    ) => Effect.Effect<number, RedisError>;
    readonly resetAllocationsImported: (
      executionId: string,
    ) => Effect.Effect<number, RedisError>;
    readonly getAllocation: (
      executionId: string,
      address: string,
    ) => Effect.Effect<Option.Option<Allocation>, RedisError>;
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
          getLatestExecution: getLatestExecution(client),
          getExecution: getExecution(client),
          saveExecution: saveExecution(client),
          saveLatestExecution: saveLatestExecution(client),
          addExecutionToIndex: addExecutionToIndex(client),
          getExecutions: getExecutions(client),
          saveAllocations: saveAllocations(client),
          incrementAllocationsImported: incrementAllocationsImported(client),
          resetAllocationsImported: resetAllocationsImported(client),
          getAllocation: getAllocation(client),
        }),
      ),
      Effect.tap((db) =>
        Effect.addFinalizer(() => Effect.sync(() => db.client.disconnect())),
      ),
    ),
  );
}

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

const getLatestExecution = (client: IORedis.Redis) =>
  pipe(
    tryPromise({
      try: () => client.get(KEYS.LATEST_EXECUTION),
      catch: redisError,
    }),
    map(Option.fromNullable),
    flatMap(hidrateExecution),
  );

const getExecution = (client: IORedis.Redis) => (id: string) =>
  pipe(
    tryPromise({
      try: () => client.get(KEYS.EXECUTION(id)),
      catch: redisError,
    }),
    map(Option.fromNullable),
    flatMap(hidrateExecution),
  );

const saveLatestExecution = (client: IORedis.Redis) => (execution: Execution) =>
  tryPromise({
    try: () => client.set(KEYS.LATEST_EXECUTION, JSON.stringify(execution)),
    catch: redisError,
  });

const saveExecution = (client: IORedis.Redis) => (execution: Execution) =>
  tryPromise({
    try: () =>
      client.set(
        KEYS.EXECUTION(execution.executionId),
        JSON.stringify(execution),
      ),
    catch: redisError,
  });

const addExecutionToIndex = (client: IORedis.Redis) => (execution: Execution) =>
  tryPromise({
    try: () =>
      client.zadd(
        KEYS.EXECUTION_INDEX,
        execution.timestamp,
        execution.executionId,
      ),
    catch: redisError,
  });

const getExecutions = (client: IORedis.Redis) =>
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
  );

const saveAllocations =
  (client: IORedis.Redis) =>
  (executionId: string, allocations: readonly AllocationQueryRow[]) =>
    tryPromise({
      try: async () => {
        let batch = client.multi();
        allocations.forEach((allocation) => {
          batch = batch
            .setex(
              KEYS.ALLOCATION_AVERAGE_HOLDINGS(executionId, allocation.address),
              REDIS_ALLOCATION_KEY_EXPIRY,
              allocation.avg_amount_held,
            )
            .setex(
              KEYS.ALLOCATION_TRANSFER_VOLUME(executionId, allocation.address),
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
    });

const incrementAllocationsImported =
  (client: IORedis.Redis) => (executionId: string, value: number) =>
    tryPromise({
      try: () => client.incrby(KEYS.ALLOCATIONS_IMPORTED(executionId), value),
      catch: redisError,
    });

const resetAllocationsImported =
  (client: IORedis.Redis) => (executionId: string) =>
    tryPromise({
      try: () => client.del(KEYS.ALLOCATIONS_IMPORTED(executionId)),
      catch: redisError,
    });

const getAllocation =
  (client: IORedis.Redis) => (executionId: string, address: string) =>
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
    );
