import { CloudTasksClient } from "@google-cloud/tasks";
import { credentials } from "@grpc/grpc-js";
import {
  GOOGLE_LOCATION,
  GOOGLE_PROJECT,
  GOOGLE_TASK_QUEUE,
  IMPORT_TASK_URL,
} from "../constants.js";
import { Effect } from "effect";

let _client: CloudTasksClient | undefined;
let _queue: string | undefined;

const getClientAndQueue = () => {
  if (_client == undefined) {
    if (process.env.NODE_ENV == "development") {
      _client = new CloudTasksClient({
        port: 9999,
        servicePath: "localhost",
        sslCreds: credentials.createInsecure(),
      });
    } else {
      _client = new CloudTasksClient();
    }
    _queue = _client.queuePath(
      GOOGLE_PROJECT,
      GOOGLE_LOCATION,
      GOOGLE_TASK_QUEUE,
    );
  }

  return { client: _client, queue: _queue };
};

export const createImportTask = (payload: object) =>
  Effect.gen(function* () {
    const { client, queue } = getClientAndQueue();
    const task = {
      httpRequest: {
        httpMethod: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: Buffer.from(JSON.stringify(payload)),
        url: IMPORT_TASK_URL,
      },
    } as const;

    yield* Effect.promise(() =>
      client.createTask({
        parent: queue,
        task,
      }),
    );
  });
