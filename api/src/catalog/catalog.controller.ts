import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DbService } from '../db/db.service';
import { MATCH, perPersonFare } from '../matching/matching.util';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly db: DbService) {}

  /** Readiness: the API and its database answer. Point your load balancer health check here. */
  @SkipThrottle()
  @Get('health')
  async health() {
    await this.db.query('select 1');
    return { status: 'ok', time: new Date().toISOString(), version: process.env.APP_VERSION ?? 'dev' };
  }

  @Get('airports')
  airports() {
    return this.db.query('select iata, name, city from airports where active = true order by iata');
  }

  @Get('places')
  async places(@Query('airport') airport?: string) {
    const rows = await this.db.query(
      `select p.id, p.label, p.est_solo_fare as "estSoloFare", a.iata as airport
       from places p join airports a on a.id = p.airport_id
       where a.active = true and ($1::text is null or a.iata = $1) order by a.iata, p.label`,
      [airport?.toUpperCase() ?? null],
    );
    // a full cab (3 riders) is the common case; shown as "from ~X" on the website
    return rows.map((r) => ({ ...r, estSharedFare: perPersonFare(r.estSoloFare, MATCH.capacity - 1) }));
  }
}
