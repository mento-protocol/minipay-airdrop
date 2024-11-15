import { Schema } from "@effect/schema";
import { Api, QuerySchema } from "effect-http";
import { Address } from "../schema.js";
import { Client } from "effect-http";
import { DUNE_API_BASE_URL, stringFromEnv } from "../constants.js";
import { Effect, Schedule } from "effect";

export const DuneAuthHeaders = Schema.Struct({
  "X-DUNE-API-KEY": Schema.String.pipe(Schema.optional()),
});

export const LatestQueryResultsParams = Schema.Struct({
  queryId: QuerySchema.Number,
});

export const ExecuteQueryParams = Schema.Struct({
  queryId: QuerySchema.Number,
});

export const ExecutionResultParams = Schema.Struct({
  executionId: Schema.String,
});

export const ResultsQuery = Schema.Struct({
  api_key: Schema.String.pipe(Schema.optional()),
  limit: QuerySchema.Number,
  offset: QuerySchema.Number.pipe(Schema.optional()),
  sample_count: QuerySchema.Number.pipe(Schema.optional()),
  filters: Schema.String.pipe(Schema.optional()),
  sort_by: Schema.String.pipe(Schema.optional()),
  columns: Schema.String.pipe(Schema.optional()),
  ignore_max_datapoints_per_request: Schema.String.pipe(Schema.optional()),
  allow_partial_results: Schema.String.pipe(Schema.optional()),
});

export const AllocationQueryRow = Schema.Struct({
  address: Address,
  mento_reward: Schema.BigInt,
  cusd_reward: Schema.BigInt,
});
export type AllocationQueryRow = Schema.Schema.Type<typeof AllocationQueryRow>;

export const StatsQueryRow = Schema.Struct({
  total_recipients: Schema.Number,
  total_mento_reward: Schema.BigInt,
  total_cusd_reward: Schema.BigInt,
});

// const QueryRow = Schema.Union(AllocationQueryRow, StatsQueryRow)

export const ExecuteQueryResponse = Schema.Struct({
  execution_id: Schema.String,
  state: Schema.String,
});

export const QueryResult = Schema.Struct({
  metadata: Schema.Struct({
    column_names: Schema.Array(Schema.String),
    column_types: Schema.Array(Schema.String),
    result_set_bytes: Schema.Number,
    row_count: Schema.Number,
    total_result_set_bytes: Schema.Number,
    total_row_count: Schema.Number,
    datapoint_count: Schema.Number,
    pending_time_millis: Schema.Number,
    execution_time_millis: Schema.Number,
  }),
  rows: Schema.Array(Schema.Unknown),
});

export const ExecutionResultResponse = Schema.Struct({
  cancelled_at: Schema.DateFromString.pipe(Schema.optional()),
  execution_ended_at: Schema.DateFromString,
  execution_id: Schema.String,
  execution_started_at: Schema.DateFromString,
  expires_at: Schema.DateFromString,
  is_execution_finished: Schema.Boolean,
  next_offset: Schema.Number.pipe(Schema.optional()),
  next_uri: Schema.String.pipe(Schema.optional()),
  query_id: Schema.Number,
  result: QueryResult,
  state: Schema.String,
  submitted_at: Schema.DateFromString,
});

export const LatestQueryResultsResponse = Schema.Struct({
  execution_id: Schema.String,
  query_id: Schema.Number,
  state: Schema.String,
  is_execution_finished: Schema.Boolean,
  submitted_at: Schema.String,
  expires_at: Schema.String,
  execution_started_at: Schema.DateFromString,
  execution_ended_at: Schema.DateFromString,
  next_offset: Schema.Number.pipe(Schema.optional()),
  next_uri: Schema.String.pipe(Schema.optional()),
  result: QueryResult,
});
export type LatestQueryResultsResponse = Schema.Schema.Type<
  typeof LatestQueryResultsResponse
>;

export const api = Api.make({ title: "Dune Query API" }).pipe(
  Api.addEndpoint(
    Api.get("latestQueryResults", "/v1/query/:queryId/results").pipe(
      Api.setRequestPath(LatestQueryResultsParams),
      Api.setRequestQuery(ResultsQuery),
      Api.setResponseBody(LatestQueryResultsResponse),
      Api.setRequestHeaders(DuneAuthHeaders),
    ),
  ),
  Api.addEndpoint(
    Api.post("executeQuery", "/v1/query/:queryId/execute").pipe(
      Api.setRequestPath(ExecuteQueryParams),
      Api.setResponseBody(ExecuteQueryResponse),
      Api.setRequestHeaders(DuneAuthHeaders),
    ),
  ),
  Api.addEndpoint(
    Api.get("getExecutionResult", "/v1/execution/:executionId/results").pipe(
      Api.setRequestPath(ExecutionResultParams),
      Api.setResponseBody(ExecutionResultResponse),
      Api.setRequestQuery(ResultsQuery),
      Api.setRequestHeaders(DuneAuthHeaders),
    ),
  ),
);

const client = Client.make(api, { baseUrl: DUNE_API_BASE_URL });
const authHeader = {
  "X-DUNE-API-KEY": stringFromEnv("DUNE_API_KEY"),
};

export const latestQueryResults = (
  queryId: number,
  limit: number,
  offset?: number,
) => {
  return client
    .latestQueryResults({
      path: { queryId },
      query: { limit, offset },
      headers: authHeader,
    })
    .pipe(
      Effect.retry({
        while: (e) => e.side == "server",
        schedule: Schedule.addDelay(Schedule.recurs(2), () => "500 millis"),
      }),
    );
};

export const getExectionResults = (
  executionId: string,
  limit: number,
  offset?: number,
) => {
  return client
    .getExecutionResult({
      path: { executionId },
      query: { limit, offset },
      headers: authHeader,
    })
    .pipe(
      Effect.retry({
        while: (e) => e.side == "server",
        schedule: Schedule.addDelay(Schedule.recurs(2), () => "500 millis"),
      }),
    );
};

export const executeQuery = (queryId: number) => {
  return client
    .executeQuery({
      path: { queryId },
      headers: authHeader,
    })
    .pipe(
      Effect.retry({
        while: (e) => e.side == "server",
        schedule: Schedule.addDelay(Schedule.recurs(2), () => "500 millis"),
      }),
    );
};
