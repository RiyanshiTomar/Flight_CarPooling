import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { DbService } from '../db/db.service';
import { GroupsService } from './groups.service';

class JoinDto {
  @IsUUID() requestId: string;
}
class MessageDto {
  @IsString() @Length(1, 1000) body: string;
}

@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService, private readonly db: DbService) {}

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

  // --- chat (REST for now; Phase 3 adds WebSocket push on top of the same table) ---
  @Get(':id/messages')
  async messages(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('after') after?: string,
  ) {
    await this.groups.assertMember(u.id, id);
    const rows = await this.db.query(
      `select m.id, m.body, m.created_at, m.user_id = $2 as mine,
              split_part(coalesce(usr.name, 'Traveller'), ' ', 1) as sender
       from messages m join users usr on usr.id = m.user_id
       where m.group_id = $1 and ($3::timestamptz is null or m.created_at > $3::timestamptz)
       order by m.created_at asc limit 200`,
      [id, u.id, after ?? null],
    );
    return rows;
  }

  @Post(':id/messages')
  async send(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto) {
    await this.groups.assertMember(u.id, id);
    const [row] = await this.db.query(
      'insert into messages (group_id, user_id, body) values ($1,$2,$3) returning id, body, created_at',
      [id, u.id, dto.body.trim()],
    );
    return { ...row, mine: true };
  }
}
