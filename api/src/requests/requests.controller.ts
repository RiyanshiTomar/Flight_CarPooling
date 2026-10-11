import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { GroupsService } from '../groups/groups.service';
import { DbService } from '../db/db.service';
import { RequestsService } from './requests.service';

class CreateRequestDto {
  @IsString() @Matches(/^[A-Za-z0-9]{2}\s?\d{1,4}$/, { message: 'flightNo looks like 6E 2041' }) flightNo: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' }) date: string;
  @IsUUID() destPlaceId: string;
  @IsInt() @Min(1) @Max(3) seats: number;
  @IsIn(['none', 'cabin', 'check', 'heavy']) luggage: string;
  @IsBoolean() womenOnly: boolean;
  @IsOptional() @IsIn(['DEL', 'BLR']) airport?: string; // only used by the mock flight provider
}

@ApiTags('ride-requests')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('ride-requests')
export class RequestsController {
  constructor(private readonly svc: RequestsService, private readonly groups: GroupsService, private readonly db: DbService) {}

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
  async ownGroup(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tx(async (q) => {
      const [r] = await q.query(`select * from ride_requests where id = $1 and user_id = $2 and status in ('PENDING','MATCHED')`, [id, u.id]);
      if (!r) throw new NotFoundException('Active request not found');
      await this.groups.removeMember(q, id);
      const groupId = await this.groups.createFor(q, r as any);
      return this.groups.view(q, groupId, u.id);
    });
  }

  @Delete(':id')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(u.id, id);
  }
}
