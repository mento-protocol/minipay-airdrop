import { HttpFunction } from "@google-cloud/functions-framework";
import { HttpApp } from "@effect/platform";
import { Api, RouterBuilder } from "effect-http";
import { Console, Effect, pipe } from "effect";
import { convertIncomingMessageToRequest } from "../utils.js";
import { NodeContext } from "@effect/platform-node";
import { Schema } from "@effect/schema";
import { handleRefresh } from "../operations/handle-refresh.js";
import { handleImport } from "../operations/handle-import.js";
import { NodeSwaggerFiles } from "effect-http-node";
import { Redis } from "../services/redis.js";

const OK = Schema.Struct({
  ok: Schema.Literal(true),
});
type OK = Schema.Schema.Type<typeof OK>;

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
    }).pipe(Api.setResponseBody(OK)),
  ),
  Api.addEndpoint(
    Api.post("import", "/import", {
      description: `[INTERNAL] Import a chunk of data from the Dune materialized view`,
    }).pipe(Api.setRequestBody(ImportBody), Api.setResponseBody(OK)),
  ),
);

const internalApp = pipe(
  RouterBuilder.make(api, { enableDocs: false }),
  RouterBuilder.handle("refresh", () => {
    return handleRefresh.pipe(
      Effect.provide(Redis.live),
      Effect.scoped,
      Effect.tapError(Console.log),
      Effect.map(() => ({ ok: true as const })),
    );
  }),
  RouterBuilder.handle("import", ({ body }) => {
    return handleImport(body).pipe(
      Effect.provide(Redis.live),
      Effect.scoped,
      Effect.tapError(Console.log),
      Effect.map(() => ({ ok: true as const })),
    );
  }),
  RouterBuilder.build,
);

export const handler = internalApp.pipe(
  Effect.provide(NodeSwaggerFiles.SwaggerFilesLive),
  Effect.provide(NodeContext.layer),
  HttpApp.toWebHandler,
);

export const internal: HttpFunction = async (req, res) => {
  const res2 = await handler(convertIncomingMessageToRequest(req));
  const resp = await res2.text();
  console.log(resp);
  res.status(res2.status).send(resp);
};
