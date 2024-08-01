import { Inspectable, Effect, Context, FiberRef, pipe, Logger } from "effect";
import {
  structuredLogger,
  map,
  Logger as TLogger,
  make as makeLogger,
} from "effect/Logger";
import { stringFromEnv } from "./constants.js";
import { HttpServerRequest } from "@effect/platform/HttpServerRequest";
import { HttpApp } from "@effect/platform";

const GOOGLE_PROJECT = stringFromEnv("GOOGLE_PROJECT");

const googleCloudLogger = map(structuredLogger, (log) => {
  let trace: string | undefined;
  if (
    log.annotations["google.traceId"] &&
    typeof log.annotations["google.traceId"] == "string"
  ) {
    const traceId = log.annotations["google.traceId"];
    trace = `projects/${GOOGLE_PROJECT}/traces/${traceId}`;
    delete log.annotations["google.traceId"];
  }
  return {
    severity: log.logLevel,
    message: log.message,
    timestamp: log.timestamp,
    cause: log.cause,
    annotations: log.annotations,
    spans: log.spans,
    "logging.googleapis.com/trace": trace,
  };
});

const loggerWithConsoleLog = <M, O>(self: TLogger<M, O>): TLogger<M, void> =>
  makeLogger((opts) => {
    console.log(Inspectable.stringifyCircular(self.log(opts)));
  });

export const googleCloudLoggerJson = loggerWithConsoleLog(googleCloudLogger);

export const logMiddleware = <E, R>(
  httpApp: HttpApp.Default<E, R>,
): HttpApp.Default<E, R> => {
  return Effect.withFiberRuntime((fiber) => {
    const context = fiber.getFiberRef(FiberRef.currentContext);
    const request = Context.unsafeGet(context, HttpServerRequest);
    const [traceId] = (request.headers["x-cloud-trace-context"] || "").split(
      "/",
    );
    return pipe(
      httpApp,
      Effect.annotateLogs("google.traceId", traceId),
      Effect.provide(
        Logger.replace(
          Logger.defaultLogger,
          process.env.NODE_ENV == "development"
            ? Logger.prettyLogger()
            : googleCloudLoggerJson,
        ),
      ),
    );
  });
};
