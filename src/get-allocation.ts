import { HttpFunction } from "@google-cloud/functions-framework";
import { HttpApp } from "@effect/platform";
import { api } from "./api.js";
import { RouterBuilder } from "effect-http";
import { Effect, pipe } from "effect";
import { convertIncomingMessageToRequest, randAlloc } from "./utils.js";
import { NodeContext } from "@effect/platform-node";
import { NodeSwaggerFiles } from "effect-http-node";

const getAllocationApp = pipe(
  RouterBuilder.make(api, { enableDocs: false }),
  RouterBuilder.handle("allocation", ({ path: { address } }) => {
    return Effect.succeed(randAlloc(address));
  }),
  RouterBuilder.build,
);

export const handler = getAllocationApp.pipe(
  Effect.provide(NodeSwaggerFiles.SwaggerFilesLive),
  Effect.provide(NodeContext.layer),
  HttpApp.toWebHandler,
);

export const getAllocation: HttpFunction = async (req, res) => {
  const res2 = await handler(convertIncomingMessageToRequest(req));
  res.status(res2.status).send(await res2.text());
};
