import { RouterBuilder } from "effect-http";
import { Effect, Logger } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { NodeServer } from "effect-http-node";
import {
  forbidden,
  internalServerError,
  tooManyRequests,
} from "effect-http/HttpError";

import { api } from "./api.js";
import { alloc, randAlloc } from "./utils.js";

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
      default:
        return Effect.succeed(randAlloc(address));
    }
  }),
  RouterBuilder.build,
);

app.pipe(
  NodeServer.listen({ port: 3000 }),
  Effect.provide(Logger.pretty),
  NodeRuntime.runMain,
);
