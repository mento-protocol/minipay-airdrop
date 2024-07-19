import { HttpFunction } from "@google-cloud/functions-framework"

export const hello: HttpFunction = (_, res) => {
  res.send(`Hello world`);
}
