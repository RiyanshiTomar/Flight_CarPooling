import { Body, Controller, Delete, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { UsersService } from './users.service';

class UpdateMeDto {
  @IsOptional() @IsString() @Length(2, 60) @Matches(/^[\p{L} .'-]+$/u, { message: 'Name can only have letters, spaces and . \' -' }) name?: string;
  @IsOptional() @IsIn(['female', 'male', 'other']) gender?: 'female' | 'male' | 'other';
  @IsOptional() @IsString() @MaxLength(60) trustedContactName?: string;
  /** empty string clears it */
  @IsOptional() @ValidateIf((o) => o.trustedContactPhone !== '') @IsString() @Length(10, 16) trustedContactPhone?: string;
}

class DeleteMeDto {
  @IsString() @IsIn(['DELETE']) confirm: string;
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() u: AuthUser) {
    return this.users.get(u.id);
  }

  @Patch()
  update(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.update(u.id, dto);
  }

  /** Trips, money saved, people met. */
  @Get('stats')
  stats(@CurrentUser() u: AuthUser) {
    return this.users.stats(u.id);
  }

  /** DPDP Act: users can erase their account. Active rides are cancelled and personal data is wiped. */
  @Delete()
  @HttpCode(200)
  remove(@CurrentUser() u: AuthUser, @Body() _dto: DeleteMeDto) {
    return this.users.deleteAccount(u.id);
  }
}
