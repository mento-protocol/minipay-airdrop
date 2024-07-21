import { Client } from "effect-http";
import { api } from "../dune/api.js";

import dotenv from "dotenv";
import { Console, Effect } from "effect";
dotenv.config({ path: ".env.local" });

const client = Client.make(api, { baseUrl: "https://api.dune.com/api" });

client
  .latestQueryResults({
    path: {
      queryId: 3931757,
    },
    query: {
      limit: 10,
    },
    headers: {
      "X-DUNE-API-KEY": process.env.DUNE_API_KEY!,
    },
  })
  .pipe(Effect.flatMap(Console.log), Effect.runPromise);
