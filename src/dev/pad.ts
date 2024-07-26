import { Console, Effect, pipe } from "effect";
import {
  getLatestExecution,
  Redis,
  saveLatestExecution,
} from "../services/redis.js";
import { DUNE_AIRDROP_QUERY_ID } from "../constants.js";
import { latestQueryResults } from "../services/dune.js";
import { handleRefresh } from "../operations/handle-refresh.js";
import { handleImport } from "../operations/handle-import.js";
import { getAllocation } from "../operations/get-allocation.js";

const _refresh = handleRefresh.pipe(
  Effect.tap(Console.log),
  Effect.provide(Redis.live),
  Effect.scoped,
);

// Effect.runPromise
const _import = handleImport({
  executionId: "01J3J1E90H9QJGJ3H7SD1AD6HM",
  offset: 2180000,
  limit: 10000,
  batchIndex: 218,
}).pipe(
  Effect.provide(Redis.live),
  Effect.scoped,
  Effect.tapError(Console.log),
  //  Effect.runPromise
);

const _getAllocation = getAllocation(
  "0xd163fa89eb9b15b2ec055529d8208a134dd77444",
).pipe(
  Effect.tap(Console.log),
  Effect.provide(Redis.live),
  Effect.scoped,
  // Effect.runPromise,
);
const _latestQuery = latestQueryResults(DUNE_AIRDROP_QUERY_ID, 5000000, 0).pipe(
  Effect.map((r) => r.result.metadata),
  Effect.tap(Console.log),
  Effect.scoped,
  Effect.tapError(Console.log),
  // Effect.runPromise
);

const _getLatest = getLatestExecution.pipe(
  Effect.tap(Console.log),
  Effect.provide(Redis.live),
  Effect.scoped,
  Effect.andThen(
    pipe(
      saveLatestExecution({
        executionId: "asasd",
        timestamp: 1234,
        importFinished: false,
        rows: 10000,
        stats: {
          block: 0,
          mentoAllocated: 0,
          recipients: 0,
        },
      }).pipe(
        Effect.tap(Console.log),
        Effect.provide(Redis.live),
        Effect.scoped,
      ),
    ),
  ),
  // Effect.runPromise
);

const getProgram = () => {
  const cmd = process.argv[2];
  switch (cmd) {
    case "refresh":
      return _refresh;
    case "getLatest":
      return _getLatest;
    case "latestQueryResults":
      return _latestQuery;
    case "getAllocation":
      return _getAllocation;
    case "import":
      return _import;
    default:
      console.log("Unexpected script");
  }
};

// @ts-expect-error Devs will keep multiplexer in check.
getProgram().pipe(Effect.runPromise);
