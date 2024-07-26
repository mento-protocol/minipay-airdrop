import { HttpFunction } from "@google-cloud/functions-framework";
import { HttpApp, HttpMiddleware } from "@effect/platform";
import { RouterBuilder } from "effect-http";
import { Effect, pipe } from "effect";
import { convertIncomingMessageToRequest, randAlloc } from "../utils.js";
import { NodeContext } from "@effect/platform-node";
import { NodeSwaggerFiles } from "effect-http-node";
import { Schema } from "@effect/schema";
import { Api } from "effect-http";
import { Address } from "../schema.js";

const GetAllocationResponse = Schema.Struct({
  address: Address,
  total: Schema.Number,
  refreshedAt: Schema.Number,
  byTask: Schema.Struct({
    hold: Schema.Number,
    transfer: Schema.Number,
  }),
});
export type GetAllocationResponse = Schema.Schema.Type<
  typeof GetAllocationResponse
>;

const GetAllocationParams = Schema.Struct({ address: Address });
export type GetAllocationParams = Schema.Schema.Type<
  typeof GetAllocationParams
>;

export const api = Api.make({ title: "Minipay Airdrop Allocation API" }).pipe(
  Api.addEndpoint(
    Api.get("allocation", "/allocation/:address", {
      description: `
      When running the mock development server you can query these addresses to test special scenarios:
      - 0xb873Bb7e3B723C49B9516566a0B150bbfe1E1Dac will return a 403 Forbidden.
      - 0x11815DeF716bFC4a394a32Ea41a981f3aC56D0d9 will be rate limited 50% of the time, good for testing retries.
      - 0xc9D04AFEa3d50632Cd0ad879E858F043d17407Ae will fail with 500 Internal Server Error.
      - 0x556DDc9381dF097C4946De438a4272ECba26A496 will return an empty allocation.
      - 0x126996CEFe1b367C66475b7A6208B6b6f0fD5648 will fail with 404 and no-latest-execution error
      - 0xcad0ca3bD13E50e1Bd30fE64A4fBc16CAE6cbD31 will fail with 404 and no-allocation error
      - <any address> will return a random allocation
      `,
    }).pipe(
      Api.setResponseBody(GetAllocationResponse),
      Api.setRequestPath(GetAllocationParams),
    ),
  ),
);

const externalApp = pipe(
  RouterBuilder.make(api, { enableDocs: false }),
  RouterBuilder.handle("allocation", ({ path: { address } }) => {
    return Effect.succeed(randAlloc(address));
    // return getAllocation(address).pipe(
    // )
  }),
  RouterBuilder.build,
  HttpMiddleware.cors({
    allowedOrigins: ["*"],
    allowedMethods: ["GET", "OPTIONS"],
  }),
);

export const handler = externalApp.pipe(
  Effect.provide(NodeSwaggerFiles.SwaggerFilesLive),
  Effect.provide(NodeContext.layer),
  HttpApp.toWebHandler,
);

export const external: HttpFunction = async (req, res) => {
  const res2 = await handler(convertIncomingMessageToRequest(req));
  res.status(res2.status).send(await res2.text());
};
