import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CatalogController } from './catalog/catalog.controller';
import { DbModule } from './db/db.module';
import { EventsModule } from './events/events.module';
import { FlightsModule } from './flights/flights.module';
import { GroupsModule } from './groups/groups.module';
import { JobsModule } from './jobs/jobs.service';
import { RequestsModule } from './requests/requests.module';
import { SafetyModule } from './safety/safety.module';
import { SmsModule } from './sms/sms.service';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // global default: 120 requests/min per IP. Auth routes override with stricter limits.
    // Several instances? Each keeps its own counters; put a shared limiter (Redis store or your CDN/WAF) in front.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT ?? 120) }]),
    DbModule,
    SmsModule,
    EventsModule,
    AuthModule,
    UsersModule,
    FlightsModule,
    GroupsModule,
    RequestsModule,
    SafetyModule,
    JobsModule,
  ],
  controllers: [CatalogController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
