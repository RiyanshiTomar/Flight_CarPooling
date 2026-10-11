import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CatalogController } from './catalog/catalog.controller';
import { DbModule } from './db/db.module';
import { FlightsModule } from './flights/flights.module';
import { GroupsModule } from './groups/groups.module';
import { RequestsModule } from './requests/requests.module';

@Module({
  imports: [
    // global default: 120 requests/min per IP. Auth routes override with stricter limits.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT ?? 120) }]),
    DbModule,
    AuthModule,
    FlightsModule,
    GroupsModule,
    RequestsModule,
  ],
  controllers: [CatalogController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
