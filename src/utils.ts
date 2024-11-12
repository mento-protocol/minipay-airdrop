import {
  Request as ExpressRequest,
  HttpFunction,
} from "@google-cloud/functions-framework";
import { GetAllocationResponse } from "./entry/external.js";
import { Address } from "./schema.js";
import { Effect } from "effect";

export const alloc = (
  address: Address,
  mento_reward: bigint,
  cusd_reward: bigint,
  refreshedAt: number,
): GetAllocationResponse => {
  return {
    address,
    refreshedAt,
    allocation: {
      mento: mento_reward,
      cusd: cusd_reward,
    },
  };
};

export const randAlloc = (address: Address): GetAllocationResponse => {
  return alloc(
    address,
    BigInt(Math.random() * 300),
    BigInt(Math.random() * 300),
    Date.now()
  );
};

export const convertIncomingMessageToRequest = (
  req: ExpressRequest,
): Request => {
  const url = req.protocol + "://" + req.get("host") + req.originalUrl;
  const headers = new Headers();
  for (const key in req.headers) {
    if (req.headers[key]) headers.append(key, req.headers[key] as string);
  }

  const request = new Request(url, {
    method: req.method,
    body: req.method === "POST" ? (req.rawBody?.toString() ?? null) : null,
    headers,
  });
  return request;
};

export const toCloudFunctionHandler = (
  handler: (request: Request) => Promise<Response>,
): HttpFunction => {
  return async (req, res) => {
    try {
      const nodeResponse = await handler(convertIncomingMessageToRequest(req));
      nodeResponse.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const resBody = await nodeResponse.text();
      res.status(nodeResponse.status).send(resBody);
    } catch (e) {
      Effect.logError(e).pipe(Effect.runSync);
    }
  };
};
