import { Schema } from "@effect/schema";
import { Api, QuerySchema } from "effect-http";
import { Address } from "../api.js";

export const DuneAuthHeaders = Schema.Struct({
  "X-DUNE-API-KEY": Schema.String.pipe(Schema.optional),
});

export const LatestQueryResultsParams = Schema.Struct({
  queryId: QuerySchema.Number,
});
export const LatestQueryResultsQuery = Schema.Struct({
  api_key: Schema.String.pipe(Schema.optional),
  limit: QuerySchema.Number,
  offset: QuerySchema.Number.pipe(Schema.optional),
  sample_count: QuerySchema.Number.pipe(Schema.optional),
  filters: Schema.String.pipe(Schema.optional),
  sort_by: Schema.String.pipe(Schema.optional),
  columns: Schema.String.pipe(Schema.optional),
  ignore_max_datapoints_per_request: Schema.String.pipe(Schema.optional),
  allow_partial_results: Schema.String.pipe(Schema.optional),
});
export const LatestQueryResultsResponse = Schema.Struct({
  execution_id: Schema.String,
  query_id: Schema.Number,
  state: Schema.String,
  is_execution_finished: Schema.Boolean,
  submitted_at: Schema.String,
  expires_at: Schema.String,
  execution_started_at: Schema.String,
  execution_ended_at: Schema.String,
  next_offset: Schema.Number,
  next_uri: Schema.String,
  result: Schema.Struct({
    metadata: Schema.Struct({
      column_names: Schema.Array(Schema.String),
      result_set_bytes: Schema.Number,
      row_count: Schema.Number,
      total_result_set_bytes: Schema.Number,
      total_row_count: Schema.Number,
      datapoint_count: Schema.Number,
      pending_time_millis: Schema.Number,
      execution_time_millis: Schema.Number,
    }),
    rows: Schema.Array(
      Schema.Struct({
        address: Address,
        balance: Schema.Number,
      }),
    ),
  }),
});

export const api = Api.make({ title: "Dune Query API" }).pipe(
  Api.addEndpoint(
    Api.get("latestQueryResults", "/v1/query/:queryId/results").pipe(
      Api.setRequestPath(LatestQueryResultsParams),
      Api.setRequestQuery(LatestQueryResultsQuery),
      Api.setResponseBody(LatestQueryResultsResponse),
      Api.setRequestHeaders(DuneAuthHeaders),
    ),
  ),
);
