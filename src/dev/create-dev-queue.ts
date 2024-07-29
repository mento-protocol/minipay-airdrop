import { Console, Effect, Schedule } from "effect";
import { getClientAndQueue } from "../services/tasks.js";
import { GOOGLE_LOCATION, GOOGLE_PROJECT } from "../constants.js";

class TaskQueueError {
  readonly __tag = "TaskQueueError";
  constructor(public reason: string) {}
}

const createDevQueue = Effect.gen(function* () {
  const { client, queue } = getClientAndQueue();
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      client.close();
    }),
  );

  const parent = client.locationPath(GOOGLE_PROJECT, GOOGLE_LOCATION);
  const request = {
    queue: {
      name: queue,
      rateLimits: {
        maxDispatchesPerSecond: 1,
        maxConcurrentDispatches: 1,
        maxBurstSize: 1,
      },
      retryConfig: {
        maxAttempts: 1,
      },
    },
    parent: parent,
  };

  yield* Effect.tryPromise({
    try: () => {
      console.log("Trying to create queue: ", request.queue.name);
      return client.createQueue(request);
    },
    catch: (e) => {
      // @ts-expect-error dev script, won't be too crazy
      return new TaskQueueError(e.details);
    },
  }).pipe(
    Effect.retry({
      schedule: Schedule.addDelay(Schedule.recurs(30), () => "2 seconds"),
    }),
    Effect.tapError(Console.log),
  );
});

createDevQueue.pipe(
  Effect.scoped,
  Effect.tap(Console.log("Queue Created!")),
  Effect.runPromiseExit,
);
