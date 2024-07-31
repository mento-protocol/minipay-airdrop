import { Console, Effect, pipe } from "effect";
import { Database, getLatestExecution } from "../services/database.js";
import { DUNE_AIRDROP_QUERY_ID } from "../constants.js";
import { latestQueryResults } from "../services/dune.js";
import { handleRefresh } from "../operations/handle-refresh.js";
import { handleImport } from "../operations/handle-import.js";
import { getAllocation } from "../operations/get-allocation.js";
import { credentials } from "@grpc/grpc-js";
import { CloudTasksClient } from "@google-cloud/tasks";

const _refresh = handleRefresh.pipe(
  Effect.tap(Console.log),
  Effect.provide(Database.live),
  Effect.scoped,
);

// Effect.runPromise
const _import = handleImport({
  executionId: "01J3J1E90H9QJGJ3H7SD1AD6HM",
  offset: 2180000,
  limit: 10000,
  batchIndex: 218,
}).pipe(
  Effect.provide(Database.live),
  Effect.scoped,
  Effect.tapError(Console.log),
  //  Effect.runPromise
);

const _getAllocation = getAllocation(
  "0xd163fa89eb9b15b2ec055529d8208a134dd77444",
).pipe(
  Effect.tap(Console.log),
  Effect.provide(Database.live),
  Effect.scoped,
  // Effect.runPromise,
);
const _latestQuery = latestQueryResults(DUNE_AIRDROP_QUERY_ID, 5000000, 0).pipe(
  Effect.tap(Console.log),
  Effect.scoped,
  Effect.tapError(Console.log),
);

const _getLatest = getLatestExecution.pipe(
  Effect.tap(Console.log),
  Effect.provide(Database.live),
  Effect.scoped,
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
