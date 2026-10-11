import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { FlightsService } from './flights.service';

@ApiTags('flights')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('flights')
export class FlightsController {
  constructor(private readonly flights: FlightsService) {}

  @Get(':flightNo')
  get(@Param('flightNo') flightNo: string, @Query('date') date?: string, @Query('airport') airport?: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('date=YYYY-MM-DD is required');
    return this.flights.lookup(flightNo, date, airport);
  }
}
