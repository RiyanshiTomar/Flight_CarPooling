import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';
import { AuthService } from './auth.service';

class RequestOtpDto {
  @IsString() @Length(10, 16) phone: string;
}
class VerifyOtpDto {
  @IsString() @Length(10, 16) phone: string;
  @IsString() @Length(6, 6) code: string;
}
class RefreshDto {
  @IsString() @Length(20, 200) refreshToken: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // strict limit: SMS costs money and OTPs are brute-forceable
  @Throttle({ default: { limit: Number(process.env.OTP_RATE_LIMIT ?? 5), ttl: 60_000 } })
  @Post('otp/request')
  request(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Throttle({ default: { limit: Number(process.env.OTP_RATE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('otp/verify')
  verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  /** Swap a refresh token for a new access token + a new refresh token (the old one stops working). */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
