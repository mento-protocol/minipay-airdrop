import {
  Request as ExpressRequest,
  HttpFunction,
} from "@google-cloud/functions-framework";
import { GetAllocationResponse } from "./entry/external.js";
import { Address } from "./schema.js";

export const alloc = (
  address: Address,
  hold: number,
  transfer: number,
  refreshedAt?: number,
): GetAllocationResponse => ({
  address,
  total: hold + transfer,
  byTask: { hold, transfer },
  refreshedAt: refreshedAt ? refreshedAt : Date.now(),
});

export const randAlloc = (address: Address): GetAllocationResponse => {
  return alloc(address, Math.random() * 100, Math.random() * 100);
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
    body: req.method === "POST" ? req.rawBody!.toString() : null,
    headers,
  });
  return request;
};

export const convertToHttpFunction = (
  handler: (request: Request) => Promise<Response>,
): HttpFunction => {
  return async (req, res) => {
    if (process.env.NODE_ENV) {
      res.set("Access-Control-Allow-Origin", "minipay.mento.org");
    } else {
      res.set("Access-Control-Allow-Origin", "localhost");
    }
    if (req.method == "OPTIONS") {
      // Send response to OPTIONS requests
      res.set("Access-Control-Allow-Methods", "GET");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Max-Age", "3600");
      res.status(204).send("");
    } else {
      const { status, text } = await handler(
        convertIncomingMessageToRequest(req),
      );
      res.status(status).send(await text());
    }
  };
};
