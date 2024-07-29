import { RouterBuilder } from "effect-http";
import { Effect, Logger } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { NodeServer } from "effect-http-node";
import {
  forbidden,
  internalServerError,
  tooManyRequests,
} from "effect-http/HttpError";

import { api } from "../entry/external.js";
import { alloc, randAlloc } from "../utils.js";
import { HttpMiddleware } from "@effect/platform";
import { noAllocation, noExecution } from "../operations/get-allocation.js";

const app = RouterBuilder.make(api).pipe(
  RouterBuilder.handle("allocation", ({ path: { address } }) => {
    switch (address) {
      case "0xb873Bb7e3B723C49B9516566a0B150bbfe1E1Dac":
        return Effect.fail(forbidden());
      case "0x11815DeF716bFC4a394a32Ea41a981f3aC56D0d9":
        if (Math.random() > 0.5) {
          return Effect.fail(tooManyRequests());
        }
        return Effect.succeed(randAlloc(address));
      case "0xc9D04AFEa3d50632Cd0ad879E858F043d17407Ae":
        return Effect.fail(internalServerError());
      case "0x556DDc9381dF097C4946De438a4272ECba26A496":
        return Effect.succeed(alloc(address, 0, 0));
      case "0x126996CEFe1b367C66475b7A6208B6b6f0fD5648":
        return Effect.fail(noExecution());
      case "0xcad0ca3bD13E50e1Bd30fE64A4fBc16CAE6cbD31":
        return Effect.fail(noAllocation());
      default:
        return Effect.succeed(randAlloc(address));
    }
  }),
  RouterBuilder.build,
);

app.pipe(
  HttpMiddleware.cors({
    allowedOrigins: ["*"],
    allowedMethods: ["GET", "OPTIONS"],
  }),
  NodeServer.listen({ port: 3000 }),
  Effect.provide(Logger.pretty),
  NodeRuntime.runMain,
);
