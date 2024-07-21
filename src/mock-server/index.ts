import { Schema } from "@effect/schema";
import { Api, RouterBuilder } from "effect-http";
import { Data, Effect, Logger } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { NodeServer } from "effect-http-node";
import {
  forbidden,
  internalServerError,
  tooManyRequests,
} from "effect-http/HttpError";

export const Hex = Schema.TemplateLiteral(
  Schema.Literal("0x"),
  Schema.String,
).pipe(
  Schema.filter((s) =>
    /^0x[a-fA-F0-9]*$/.exec(s)
      ? undefined
      : "Address must be a 0x prefixed hexadecimal string",
  ),
  // Schema.filter(s => s.length == 42 ? undefined : "address must pe 42 characters (including 0x)"),
);

export type Hex = Schema.Schema.Type<typeof Hex>;

const GetAllocationResponse = Schema.Struct({
  address: Hex,
  total: Schema.Number,
  byTask: Schema.Struct({
    hold: Schema.Number,
    transfer: Schema.Number,
  }),
});
export type GetAllocationResponse = Schema.Schema.Type<
  typeof GetAllocationResponse
>;

const GetAllocationParams = Schema.Struct({ address: Hex });
export type GetAllocationParams = Schema.Schema.Type<
  typeof GetAllocationParams
>;

const api = Api.make({ title: "Minipay Airdrop Allocation API" }).pipe(
  Api.addEndpoint(
    Api.get("allocation", "/allocation/:address").pipe(
      Api.setResponseBody(GetAllocationResponse),
      Api.setRequestPath(GetAllocationParams),
    ),
  ),
);

const alloc = (
  address: Hex,
  hold: number,
  transfer: number,
): GetAllocationResponse => ({
  address,
  total: hold + transfer,
  byTask: { hold, transfer },
});

const randAlloc = (address: Hex): GetAllocationResponse => {
  return alloc(address, Math.random() * 100, Math.random() * 100);
};

class MyError extends Data.TaggedError("MyError")<{}> {}

const app = RouterBuilder.make(api).pipe(
  RouterBuilder.handle("allocation", ({ path: { address } }) => {
    // return Effect.fail(new Error(address));
    console.log(address);

    return Effect.fail(forbidden);
    // switch (address) {
    //   case "0xb873Bb7e3B723C49B9516566a0B150bbfe1E1Dac": return Effect.fail(new Error("asd"))
    //   case "0x11815DeF716bFC4a394a32Ea41a981f3aC56D0d9":
    //     if (Math.random() > 0.5) {
    //       return Effect.fail(tooManyRequests)
    //     }
    //     return Effect.succeed(randAlloc(address))
    //   case "0xc9D04AFEa3d50632Cd0ad879E858F043d17407Ae": return Effect.fail(internalServerError)
    //   case "0x556DDc9381dF097C4946De438a4272ECba26A496": return Effect.succeed(alloc(address, 40, 60))
    //   default: return Effect.succeed(alloc(address, 0, 0))
    // }
  }),
  RouterBuilder.build,
);

app.pipe(
  NodeServer.listen({ port: 3000 }),
  Effect.provide(Logger.pretty),
  NodeRuntime.runMain,
);
