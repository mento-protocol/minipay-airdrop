import { CloudTasksClient } from "@google-cloud/tasks";
import { credentials } from "@grpc/grpc-js";
import { stringFromEnv } from "../constants.js";
import { Context, Effect, Layer, pipe } from "effect";

export class Tasks extends Context.Tag("Tasks")<
  Tasks,
  {
    readonly client: CloudTasksClient;
    readonly queue: string;
    readonly importUrl: string;
    readonly invokerServiceAccountEmail: string;
    readonly invokerAudience: string;
  }
>() {
  static readonly live = Layer.effect(
    Tasks,
    pipe(
      Effect.sync(() => {
        if (process.env.NODE_ENV == "development") {
          return new CloudTasksClient({
            port: 9999,
            servicePath: "localhost",
            sslCreds: credentials.createInsecure(),
          });
        } else {
          return new CloudTasksClient();
        }
      }),
      Effect.orDie,
      Effect.map((client) =>
        Tasks.of({
          client,
          queue: client.queuePath(
            stringFromEnv("GOOGLE_PROJECT"),
            stringFromEnv("GOOGLE_LOCATION"),
            stringFromEnv("GOOGLE_TASK_QUEUE"),
          ),
          importUrl: stringFromEnv("IMPORT_TASK_URL"),
          invokerServiceAccountEmail: stringFromEnv(
            "INVOKER_SERVICE_ACCOUNT_EMAIL",
          ),
          invokerAudience: stringFromEnv("INVOKER_AUDIENCE"),
        }),
      ),
      Effect.tap(({ client }) =>
        Effect.addFinalizer(() => Effect.promise(client.close)),
      ),
    ),
  );
}

export const createImportTask = (payload: object) =>
  Tasks.pipe(
    Effect.flatMap((tasks) =>
      pipe(
        Effect.promise(async () => {
          await tasks.client.createTask({
            parent: tasks.queue,
            task: {
              httpRequest: {
                httpMethod: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: Buffer.from(JSON.stringify(payload)),
                url: tasks.importUrl,
                oidcToken: {
                  serviceAccountEmail: tasks.invokerServiceAccountEmail,
                },
              },
            },
          });
        }),
      ),
    ),
  );
