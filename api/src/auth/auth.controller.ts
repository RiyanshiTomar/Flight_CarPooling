import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { DbService } from '../db/db.service';
import { AuthGuard, AuthUser, CurrentUser } from './auth.guard';
import { AuthService } from './auth.service';

class RequestOtpDto {
  @IsString() phone: string;
}
class VerifyOtpDto {
  @IsString() phone: string;
  @IsString() @Length(6, 6) code: string;
}
class UpdateMeDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsIn(['female', 'male', 'other']) gender?: 'female' | 'male' | 'other';
}

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly db: DbService) {}

  // strict limit: SMS costs money and OTPs are brute-forceable
  @Throttle({ default: { limit: Number(process.env.OTP_RATE_LIMIT ?? 5), ttl: 60_000 } })
  @Post('auth/otp/request')
  request(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/otp/verify')
  verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const [row] = await this.db.query(
      'select id, phone, name, gender, verified_level, rating_avg, trips_count, created_at from users where id = $1',
      [u.id],
    );
    return row;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch('me')
  async update(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) {
    const [row] = await this.db.query(
      `update users set name = coalesce($2, name), gender = coalesce($3, gender) where id = $1
       returning id, phone, name, gender, verified_level, rating_avg, trips_count`,
      [u.id, dto.name ?? null, dto.gender ?? null],
    );
    return row;
  }
}
