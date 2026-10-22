import { Injectable, Logger, MessageEvent, OnModuleInit } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';
import { DbService, Queryable } from '../db/db.service';

/**
 * What the website hears about. Events carry ids only, never message bodies or personal data:
 * the client re-reads what changed through the normal authorised endpoints.
 */
export type AppEventType =
  | 'group.updated' // members, status, pickup or window changed
  | 'message.created' // new chat or system message in a group
  | 'request.updated' // one of your ride requests changed status
  | 'flight.updated'; // your flight's ETA changed

export interface AppEvent {
  type: AppEventType;
  groupId?: string;
  requestId?: string;
  /** short human text for a toast, e.g. "Meera joined your group" */
  note?: string;
}

interface Envelope {
  userIds: string[];
  event: AppEvent;
}

const CHANNEL = 'flypool_events';

/**
 * Per-user live event stream (Server-Sent Events).
 * One instance: in-memory Subject. Several instances behind a load balancer on real Postgres:
 * events go through LISTEN/NOTIFY so a user connected to instance B hears what happened on instance A.
 */
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly log = new Logger('Events');
  private readonly bus = new Subject<Envelope>();
  private distributed = false;

  constructor(private readonly db: DbService) {}

  async onModuleInit() {
    this.distributed = await this.db.listen(CHANNEL, (payload) => {
      try {
        this.bus.next(JSON.parse(payload) as Envelope);
      } catch {
        /* ignore malformed */
      }
    });
    if (this.distributed) this.log.log('Live events via Postgres LISTEN/NOTIFY');
  }

  /** Call AFTER the transaction that made the change has committed. Never throws. */
  async toUsers(userIds: string[], event: AppEvent) {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (!ids.length) return;
    const env: Envelope = { userIds: ids, event };
    try {
      if (this.distributed) await this.db.notify(CHANNEL, JSON.stringify(env));
      else this.bus.next(env);
    } catch (e: any) {
      this.log.warn(`event publish failed: ${e.message}`);
    }
  }

  async toGroup(groupId: string, event: Omit<AppEvent, 'groupId'>, opts: { except?: string; q?: Queryable } = {}) {
    try {
      const rows = await (opts.q ?? this.db).query<{ user_id: string }>(
        'select distinct user_id from group_members where group_id = $1',
        [groupId],
      );
      await this.toUsers(rows.map((r) => r.user_id).filter((id) => id !== opts.except), { ...event, groupId });
    } catch (e: any) {
      this.log.warn(`group event failed: ${e.message}`);
    }
  }

  /** The SSE stream for one user, with a heartbeat so proxies keep the connection open. */
  stream(userId: string): Observable<MessageEvent> {
    const events = this.bus.pipe(
      filter((e) => e.userIds.includes(userId)),
      map((e) => ({ type: 'event', data: e.event }) as MessageEvent),
    );
    const ping = interval(Number(process.env.SSE_HEARTBEAT_MS ?? 25_000)).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent));
    return merge(events, ping);
  }
}
