import { Request as ExpressRequest } from "@google-cloud/functions-framework";
import { GetAllocationResponse } from "./functions/external.js";
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
