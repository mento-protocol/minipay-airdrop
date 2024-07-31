import { HttpApp, HttpMiddleware } from "@effect/platform";
import { Api, RouterBuilder } from "effect-http";
import { Effect, pipe } from "effect";
import { toCloudFunctionHandler } from "../utils.js";
import { NodeContext } from "@effect/platform-node";
import { Schema } from "@effect/schema";
import { handleRefresh } from "../operations/handle-refresh.js";
import { handleImport } from "../operations/handle-import.js";
import { NodeSwaggerFiles } from "effect-http-node";
import { Database } from "../services/database.js";
import { Tasks } from "../services/tasks.js";

export const ImportBody = Schema.Struct({
  executionId: Schema.String,
  offset: Schema.Number,
  limit: Schema.Number,
  batchIndex: Schema.Number,
});
export type ImportBody = Schema.Schema.Type<typeof ImportBody>;

export const api = Api.make({ title: "Minipay Internal Data functions" }).pipe(
  Api.addEndpoint(
    Api.get("refresh", "/refresh", {
      description: `[INTERNAL] Check the Dune materialized view execution and start import process.`,
    }),
  ),
  Api.addEndpoint(
    Api.post("import", "/import", {
      description: `[INTERNAL] Import a chunk of data from the Dune materialized view`,
    }).pipe(Api.setRequestBody(ImportBody)),
  ),
);

const internalApp = pipe(
  RouterBuilder.make(api, { enableDocs: false }),
  RouterBuilder.handle("refresh", () => {
    return handleRefresh.pipe(
      Effect.tapError(Effect.logError),
      Effect.provide(Tasks.live),
      Effect.map(() => undefined), // No response body
    );
  }),
  RouterBuilder.handle("import", ({ body }) => {
    return handleImport(body).pipe(
      Effect.map(() => undefined), // No response body
    );
  }),
  RouterBuilder.build,
);

export const internal = internalApp.pipe(
  HttpMiddleware.logger,
  Effect.provide(NodeSwaggerFiles.SwaggerFilesLive),
  Effect.provide(NodeContext.layer),
  Effect.provide(Database.live),
  HttpApp.toWebHandler,
  toCloudFunctionHandler,
);
