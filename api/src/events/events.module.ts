import { Controller, Global, Header, MessageEvent, Module, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@SkipThrottle()
@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Live updates for the logged-in user (text/event-stream).
   * The website reads it with fetch() so it can send the Authorization header.
   */
  @Sse('events')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no') // nginx: do not buffer the stream
  stream(@CurrentUser() u: AuthUser): Observable<MessageEvent> {
    return this.events.stream(u.id);
  }
}

@Global()
@Module({ controllers: [EventsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}
