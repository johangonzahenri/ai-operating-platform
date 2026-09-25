import { DomainEvent, EventPublisher } from "../../domain/events/events.js";

export type EventSubscriber = (event: DomainEvent) => void;
export type SubscriberErrorHandler = (error: unknown, event: DomainEvent) => void;
export class InMemoryEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = [];
  private readonly subscribers: EventSubscriber[] = [];
  constructor(private readonly onSubscriberError: SubscriberErrorHandler = () => undefined) {}
  subscribe(subscriber: EventSubscriber): void { this.subscribers.push(subscriber); }
  publish(domainEvent: DomainEvent): void {
    this.events.push(domainEvent);
    this.subscribers.forEach((subscriber) => {
      try { subscriber(domainEvent); } catch (error) {
        try { this.onSubscriberError(error, domainEvent); } catch { /* Error observation must not break publication. */ }
      }
    });
  }
  getPublishedEvents(): readonly DomainEvent[] {
    return this.events;
  }
}
