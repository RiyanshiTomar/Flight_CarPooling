import { Module } from '@nestjs/common';
import { AeroApiProvider } from './aeroapi.provider';
import { FLIGHT_PROVIDER } from './flight-provider';
import { FlightsController } from './flights.controller';
import { FlightsService } from './flights.service';
import { MockFlightProvider } from './mock.provider';

@Module({
  controllers: [FlightsController],
  providers: [
    MockFlightProvider,
    AeroApiProvider,
    {
      provide: FLIGHT_PROVIDER,
      inject: [MockFlightProvider, AeroApiProvider],
      useFactory: (mock: MockFlightProvider, aero: AeroApiProvider) =>
        (process.env.FLIGHT_PROVIDER ?? 'mock') === 'aeroapi' ? aero : mock,
    },
    FlightsService,
  ],
  exports: [FlightsService],
})
export class FlightsModule {}
