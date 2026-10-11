import { Module } from '@nestjs/common';
import { FlightsModule } from '../flights/flights.module';
import { GroupsModule } from '../groups/groups.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [FlightsModule, GroupsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
