# Collaboration realtime strategy

## Decision

Keep the existing filtered Postgres Changes subscriptions for trip domain rows, comments, activity, and membership. Use one trip-scoped private Realtime channel (`trip:<trip_id>`) for slow-changing Presence state. Do not add mobile desktop-style cursors or migrate database changes to Broadcast yet.

This product has small travel groups, not a target of 3,000+ concurrent subscribers to the same change stream. Postgres Changes is therefore the lower-complexity choice today. `TripRealtimeProvider` remains the transport boundary so database-triggered Broadcast can replace it if measured concurrency or authorization throughput warrants that change.

Supabase references:

- [Presence](https://supabase.com/docs/guides/realtime/presence): appropriate for online/active-page state, not high-frequency updates.
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): private Broadcast/Presence access is controlled through RLS on `realtime.messages`.
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes): DELETE events cannot be filtered; authorization cost scales per subscriber and Broadcast is recommended at high concurrency.
- [Subscribing to database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes): Broadcast is the future scaling path.

## Safety and lifecycle

- Presence carries only user id, current section, optional editing entity id, connection id, and heartbeat time. Names/avatars are resolved from the RLS-protected member/profile query. It never carries precise location and is never an authorization source.
- Heartbeats run every 20 seconds; entries older than 45 seconds are hidden. Unmount calls both `untrack()` and `removeChannel()`.
- Postgres Changes DELETE filtering is handled by the existing trip-scoped delete-signal table, extended to comments and memberships.
- Every subscribe/reconnect triggers a canonical read. The provider owns one channel per trip and removes it on cleanup, preventing duplicate listeners.
- Comments are not queued offline. The composer clearly reports that a connection is required; optimistic failures roll back and expose Retry.
- Activity stores only meaningful events and expires after 90 days. Text-field keystrokes are never logged.

## Migration trigger

Revisit Broadcast when load tests show Realtime authorization lag, the product approaches roughly 3,000 concurrent subscribers on the same changes, or a durable cross-client event abstraction becomes necessary. Preserve the same consumer API and replace only the provider transport.
