// One step at a time per PayPal order: the customer's browser and PayPal's webhook
// can both try to finish the same order. Doorman runs as one process, so a queue
// in memory is enough here; the database update that claims an order guards the rest.
const queues = new Map<string, Promise<unknown>>();

export function oneAtATime<T>(key: string, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
  queues.set(key, next);
  void next
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    })
    .catch(() => {});
  return next;
}
