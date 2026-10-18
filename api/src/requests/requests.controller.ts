import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { RequestsService } from './requests.service';

class CreateRequestDto {
  @IsString() @Matches(/^[A-Za-z0-9]{2}\s?\d{1,4}$/, { message: 'Flight number looks like 6E 2041' }) flightNo: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' }) date: string;
  @IsUUID() destPlaceId: string;
  @IsInt() @Min(1) @Max(3) seats: number;
  @IsIn(['none', 'cabin', 'check', 'heavy']) luggage: string;
  @IsBoolean() womenOnly: boolean;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) airport?: string; // the airport the user picked; checked against the flight
}

@ApiTags('ride-requests')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('ride-requests')
export class RequestsController {
  constructor(private readonly svc: RequestsService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateRequestDto) {
    return this.svc.create(u.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.listMine(u.id);
  }

  @Get(':id/suggestions')
  suggestions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.suggestionsFor(u.id, id);
  }

  /** Skip the suggestions and start a fresh group of your own. */
  @Post(':id/own-group')
  ownGroup(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.ownGroup(u.id, id);
  }

  @Delete(':id')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(u.id, id);
  }
}
