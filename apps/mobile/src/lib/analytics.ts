/**
 * Analytics facade. Screens call `analytics.track(name, props)`; the provider is plugged in
 * later (Definition of Done: every story records its events).
 *
 * Rule: props never hold personal data (no names, phone numbers, usernames or free text).
 */
export type EventProps = Record<string, string | number | boolean>;
export interface AnalyticsEvent {
  name: string;
  props: EventProps;
}
type Sink = (event: AnalyticsEvent) => void;

let sinks: Sink[] = [];
let recorded: AnalyticsEvent[] = [];

export const analytics = {
  track(name: string, props: EventProps = {}): void {
    const event = { name, props };
    recorded.push(event);
    for (const sink of sinks) {
      try {
        sink(event);
      } catch {
        // Analytics must never break the app.
      }
    }
  },
  addSink(sink: Sink): () => void {
    sinks.push(sink);
    return () => {
      sinks = sinks.filter((s) => s !== sink);
    };
  },
  /** Events tracked since the last reset. Used by tests. */
  events(): AnalyticsEvent[] {
    return [...recorded];
  },
  reset(): void {
    recorded = [];
    sinks = [];
  },
};
