import { Schema } from "@effect/schema";
import { Api } from "effect-http";

export const Address = Schema.TemplateLiteral(
  Schema.Literal("0x"),
  Schema.String,
).pipe(
  Schema.filter((s) =>
    /^0x[a-fA-F0-9]*$/.exec(s)
      ? undefined
      : "Address must be a 0x prefixed hexadecimal string",
  ),
  Schema.filter((s) =>
    s.length == 42 ? undefined : "address must pe 42 characters (including 0x)",
  ),
);

export type Address = Schema.Schema.Type<typeof Address>;

const GetAllocationResponse = Schema.Struct({
  address: Address,
  total: Schema.Number,
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
      - <any address> will return a random allocation
      
      `,
    }).pipe(
      Api.setResponseBody(GetAllocationResponse),
      Api.setRequestPath(GetAllocationParams),
    ),
  ),
);
