import { Schema } from "@effect/schema";
import { Context, Effect, Layer, pipe, Option } from "effect";
import IORedis from "ioredis";
import { AllocationQueryRow } from "./dune.js";
import { numberFromEnv } from "../constants.js";

const { map, flatMap, tryPromise, tapError } = Effect;

class RedisError {
  readonly _tag = "RedisError";
  constructor(public message: string) {}
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

export class Database extends Context.Tag("Database")<
  Database,
  {
    readonly client: IORedis.Redis;
    readonly allocationKeyExpiry: number;
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
          allocationKeyExpiry: numberFromEnv(
            "REDIS_ALLOCATION_KEY_EXPIRY",
            60 * 60 * 24 * 3, // 3 days
          ),
        }),
      ),
      Effect.tap((db) =>
        Effect.addFinalizer(() => Effect.sync(() => db.client.disconnect())),
      ),
    ),
  );
}

const call = <A>(
  getter: (db: Context.Tag.Service<Database>) => PromiseLike<A>,
): Effect.Effect<A, RedisError, Database> =>
  Database.pipe(
    flatMap((db) =>
      tryPromise({
        try: () => getter(db),
        catch: (e: unknown) => new RedisError((e as Error).message),
      }),
    ),
  );

const hidrateExecution = (
  value: Option.Option<string>,
): Effect.Effect<Option.Option<Execution>> =>
  Option.match(value, {
    onSome: (raw) =>
      pipe(
        Schema.decodeUnknown(Schema.parseJson(Execution))(raw),
        tapError(Effect.logError),
        Effect.option,
      ),
    onNone: () => Effect.succeed(Option.none()),
  });

export const getLatestExecution = pipe(
  call((db) => db.client.get(KEYS.LATEST_EXECUTION)),
  map(Option.fromNullable),
  flatMap(hidrateExecution),
);

export const getExecution = (id: string) =>
  pipe(
    call((db) => db.client.get(KEYS.EXECUTION(id))),
    map(Option.fromNullable),
    flatMap(hidrateExecution),
  );

export const saveLatestExecution = (execution: Execution) =>
  call((db) => db.client.set(KEYS.LATEST_EXECUTION, JSON.stringify(execution)));

export const saveExecution = (execution: Execution) =>
  call((db) =>
    db.client.set(
      KEYS.EXECUTION(execution.executionId),
      JSON.stringify(execution),
    ),
  );

export const addExecutionToIndex = (execution: Execution) =>
  call((db) =>
    db.client.zadd(
      KEYS.EXECUTION_INDEX,
      execution.timestamp,
      execution.executionId,
    ),
  );

export const getExecutions = pipe(
  call((db) => db.client.zrevrangebyscore(KEYS.EXECUTION_INDEX, 0, -1)),
  map((result) => {
    const executions: Array<{ executionId: unknown; timestamp: unknown }> = [];
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

export const saveAllocations = (
  executionId: string,
  allocations: readonly AllocationQueryRow[],
) =>
  call(async (db) => {
    let batch = db.client.multi();
    allocations.forEach((allocation) => {
      batch = batch
        .setex(
          KEYS.ALLOCATION_AVERAGE_HOLDINGS(executionId, allocation.address),
          db.allocationKeyExpiry,
          allocation.avg_amount_held,
        )
        .setex(
          KEYS.ALLOCATION_TRANSFER_VOLUME(executionId, allocation.address),
          db.allocationKeyExpiry,
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
  });

export const incrementAllocationsImported = (
  executionId: string,
  value: number,
) =>
  call((db) => db.client.incrby(KEYS.ALLOCATIONS_IMPORTED(executionId), value));

export const resetAllocationsImported = (executionId: string) =>
  call((db) => db.client.del(KEYS.ALLOCATIONS_IMPORTED(executionId)));

export const getAllocation = (executionId: string, address: string) =>
  Effect.zipWith(
    call((db) =>
      db.client.get(KEYS.ALLOCATION_TRANSFER_VOLUME(executionId, address)),
    ),
    call((db) =>
      db.client.get(KEYS.ALLOCATION_AVERAGE_HOLDINGS(executionId, address)),
    ),
    (transferVolume, averageHoldings) => {
      return Schema.decodeUnknownOption(Allocation)({
        transferVolume,
        averageHoldings,
      });
    },
    { concurrent: true },
  );
