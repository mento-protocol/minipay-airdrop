import { Client } from "effect-http";
import { api } from "./api.js";
import { DUNE_API_KEY } from "../constants.js";

const client = Client.make(api, { baseUrl: "https://api.dune.com/api" });

export const latestQueryResults = (
  queryId: number,
  limit: number,
  offset?: number,
) => {
  return client.latestQueryResults({
    path: { queryId },
    query: { limit, offset },
    headers: {
      "X-DUNE-API-KEY": DUNE_API_KEY,
    },
  });
};

export const getExectionResults = (
  executionId: string,
  limit: number,
  offset?: number,
) => {
  return client.getExecutionResult({
    path: { executionId },
    query: { limit, offset },
    headers: {
      "X-DUNE-API-KEY": DUNE_API_KEY,
    },
  });
};

export const executeQuery = (queryId: number) => {
  return client.executeQuery({
    path: { queryId },
    headers: {
      "X-DUNE-API-KEY": DUNE_API_KEY,
    },
  });
};
