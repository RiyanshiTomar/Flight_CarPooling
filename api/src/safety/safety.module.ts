import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { REPORT_REASONS, ReportReason, SafetyService } from './safety.service';

class ReportDto {
  @IsUUID() groupId: string;
  @IsUUID() memberId: string;
  @IsIn(REPORT_REASONS as unknown as string[]) reason: ReportReason;
  @IsOptional() @IsString() @MaxLength(1000) details?: string;
  @IsOptional() @IsBoolean() block?: boolean;
}
class BlockDto {
  @IsUUID() groupId: string;
  @IsUUID() memberId: string;
}
class SosDto {
  @IsOptional() @IsUUID() groupId?: string;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
}

@ApiTags('safety')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('safety/reports')
  report(@CurrentUser() u: AuthUser, @Body() dto: ReportDto) {
    return this.safety.report(u.id, dto);
  }

  @Post('safety/blocks')
  block(@CurrentUser() u: AuthUser, @Body() dto: BlockDto) {
    return this.safety.block(u.id, dto.groupId, dto.memberId);
  }

  @Get('safety/blocks')
  blocks(@CurrentUser() u: AuthUser) {
    return this.safety.listBlocks(u.id);
  }

  @Delete('safety/blocks/:id')
  unblock(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.safety.unblock(u.id, id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('safety/sos')
  @HttpCode(200)
  sos(@CurrentUser() u: AuthUser, @Body() dto: SosDto) {
    return this.safety.sos(u.id, dto);
  }

  @Post('groups/:id/share')
  share(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.safety.createShareLink(u.id, id);
  }

  @Delete('groups/:id/share')
  unshare(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.safety.revokeShareLinks(u.id, id);
  }
}

/** Public, no login: what a family member sees when they open a shared trip link. */
@ApiTags('safety')
@Controller('share')
export class PublicShareController {
  constructor(private readonly safety: SafetyService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token')
  view(@Param('token') token: string) {
    return this.safety.publicShare(token);
  }
}

@Module({ controllers: [SafetyController, PublicShareController], providers: [SafetyService] })
export class SafetyModule {}
