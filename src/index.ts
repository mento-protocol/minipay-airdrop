import { HttpFunction } from "@google-cloud/functions-framework";

export const checkpointBalances: HttpFunction = (_, res) => {
  res.send(`Hello world 22`);
};
