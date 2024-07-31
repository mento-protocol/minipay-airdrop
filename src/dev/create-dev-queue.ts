import { Console, Effect, Schedule } from "effect";
import { Tasks } from "../services/tasks.js";
import { stringFromEnv } from "../constants.js";

class TaskQueueError {
  readonly __tag = "TaskQueueError";
  constructor(public reason: string) {}
}

const createDevQueue = Effect.gen(function* () {
  const { client, queue } = yield* Tasks;
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      client.close();
    }),
  );

  const parent = client.locationPath(
    stringFromEnv("GOOGLE_PROJECT"),
    stringFromEnv("GOOGLE_LOCATION"),
  );
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
  Effect.provide(Tasks.live),
  Effect.tap(Console.log("Queue Created!")),
  Effect.scoped,
  Effect.runPromiseExit,
);
