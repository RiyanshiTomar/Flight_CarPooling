import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DbService } from '../db/db.service';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly db: DbService) {}

  @Get('health')
  async health() {
    await this.db.query('select 1');
    return { status: 'ok', time: new Date().toISOString() };
  }

  @Get('airports')
  airports() {
    return this.db.query('select iata, name, city from airports where active = true order by iata');
  }

  @Get('places')
  places(@Query('airport') airport?: string) {
    return this.db.query(
      `select p.id, p.label, p.est_solo_fare as "estSoloFare", a.iata as airport
       from places p join airports a on a.id = p.airport_id
       where a.active = true and ($1::text is null or a.iata = $1) order by a.iata, p.label`,
      [airport?.toUpperCase() ?? null],
    );
  }
}
