import { Schema } from "@effect/schema";

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
