import { Console, Effect, pipe } from "effect";
import { getLatestExecution, Redis, saveLatestExecution } from "../db/redis.js";
import {
  DUNE_AIRDROP_QUERY_ID,
  DUNE_AIRDROP_STATS_QUERY_ID,
} from "../constants.js";
import { getExectionResults, latestQueryResults } from "../dune/client.js";
import {
  getAirdropStats,
  handleRefresh,
} from "../operations/handle-refresh.js";
import { createImportTask } from "../google/tasks.js";
import { handleImport } from "../operations/handle-import.js";
import { getAllocation } from "../operations/get-allocation.js";

//handleRefresh.pipe(
//  Effect.tap(Console.log),
//  Effect.provide(Redis.live),
//  Effect.scoped,
//  Effect.runPromise
//)
// handleImport({
//   executionId: '01J3J1E90H9QJGJ3H7SD1AD6HM',
//   offset: 2180000,
//   limit: 10000,
//   batchIndex: 218
// }).pipe(
//   Effect.provide(Redis.live),
//   Effect.scoped,
//   Effect.tapError(Console.log),
//   Effect.runPromise
// )
getAllocation("0xd163fa89eb9b15b2ec055529d8208a134dd77444").pipe(
  Effect.tap(Console.log),
  Effect.provide(Redis.live),
  Effect.scoped,
  Effect.runPromise,
);
// latestQueryResults(DUNE_AIRDROP_QUERY_ID, 5000000, 0).pipe(
//   Effect.map(r => r.result.metadata),
//   Effect.tap(Console.log),
//   Effect.scoped,
//   Effect.tapError(Console.log),
//   Effect.runPromise
// )

// getLatestExecution.pipe(
//   Effect.tap(Console.log),
//   Effect.provide(Redis.live),
//   Effect.scoped,
//   Effect.andThen(
//     pipe(
//       saveLatestExecution({
//         executionId: "asasd",
//         timestamp: 1234,
//         importFinished: false,
//         stats: {
//           block: 0,
//           mentoAllocated: 0,
//           recipients: 0,
//         }
//       }).pipe(
//         Effect.tap(Console.log),
//         Effect.provide(Redis.live),
//         Effect.scoped,
//       )
//     )
//   ),
//   Effect.runPromise
// )
//
//
// latestQueryResults(
//   DUNE_AIRDROP_STATS_QUERY_ID,
//   1
// ).pipe(
//   Effect.map(r => r.result.rows),
//   Effect.tap(Console.log),
//   Effect.runPromise
// );
//
// latestQueryResults(
//   DUNE_AIRDROP_QUERY_ID,
//   1,
// ).pipe(
//   Effect.tap(Console.log),
//   Effect.runPromise
// );
