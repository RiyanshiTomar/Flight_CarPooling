import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { GroupsService } from './groups.service';

class JoinDto {
  @IsUUID() requestId: string;
}
class MessageDto {
  @IsString() @Length(1, 1000) body: string;
}
class PickupDto {
  @IsString() @Length(3, 80) pickupPoint: string;
}
class RatingItem {
  @IsUUID() memberId: string;
  @IsInt() @Min(1) @Max(5) score: number;
  @IsOptional() @IsString() @MaxLength(300) comment?: string;
}
class RateDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => RatingItem) ratings: RatingItem[];
}
class MessagesQuery {
  @IsOptional() @IsDateString() after?: string;
}

@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.getView(u.id, id);
  }

  @Post(':id/join')
  join(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: JoinDto) {
    return this.groups.join(u.id, id, dto.requestId);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.confirm(u.id, id);
  }

  /** Leave this group but keep looking: you get a fresh group of one. */
  @Post(':id/leave')
  leave(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.leave(u.id, id);
  }

  @Patch(':id/pickup')
  pickup(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PickupDto) {
    return this.groups.updatePickup(u.id, id, dto.pickupPoint);
  }

  @Post(':id/start')
  start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.start(u.id, id);
  }

  @Post(':id/complete')
  complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.complete(u.id, id);
  }

  @Post(':id/ratings')
  rate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RateDto) {
    return this.groups.rate(u.id, id, dto.ratings);
  }

  // --- chat: REST for history and sending; new messages are announced over GET /events (SSE) ---
  @Get(':id/messages')
  messages(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: MessagesQuery) {
    return this.groups.messages(u.id, id, q.after);
  }

  @Post(':id/messages')
  send(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto) {
    return this.groups.send(u.id, id, dto.body);
  }
}
