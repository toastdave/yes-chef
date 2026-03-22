import type { Database } from "bun:sqlite";

import { createId } from "../core/ids.ts";
import { persistEvent } from "./store.ts";
import type { EventInput, YesChefEvent } from "./types.ts";

export type EventSubscriber = (event: YesChefEvent) => void | Promise<void>;

export interface EventBus {
  emit: (input: EventInput) => Promise<YesChefEvent>;
  subscribe: (subscriber: EventSubscriber) => () => void;
}

export function createEventBus(db: Database, root: string): EventBus {
  const subscribers = new Set<EventSubscriber>();

  return {
    async emit(input) {
      const event: YesChefEvent = {
        id: createId("evt"),
        ts: new Date().toISOString(),
        type: input.type,
        menu_id: input.menu_id ?? null,
        order_id: input.order_id ?? null,
        run_id: input.run_id ?? null,
        role: input.role ?? null,
        payload: input.payload ?? {},
      };

      await persistEvent(db, root, event);

      for (const subscriber of subscribers) {
        await subscriber(event);
      }

      return event;
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
}
