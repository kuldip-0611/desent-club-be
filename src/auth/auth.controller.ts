import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Roles } from './decorators/roles.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminProtectedResponseDto } from './dto/admin-protected-response.dto';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { SendPhoneOtpDto } from './dto/send-phone-otp.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { UserLoginDto } from './dto/user-login.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Login/signup using Google ID token' })
  @ApiBody({ type: GoogleLoginDto })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Invalid Google token' })
  @Post('google')
  loginWithGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto);
  }

  @ApiOperation({
    summary: 'Register with email and password (verification email sent)',
  })
  @ApiBody({ type: RegisterDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({
    summary: 'User login with email and password (verified accounts only)',
  })
  @ApiBody({ type: UserLoginDto })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or email not verified',
  })
  @Post('login')
  userLogin(@Body() dto: UserLoginDto) {
    return this.authService.userLogin(dto);
  }

  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Send OTP to email' })
  @ApiBody({ type: SendEmailOtpDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @Post('email/send-otp')
  sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.authService.sendEmailOtp(dto);
  }

  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Resend OTP to email' })
  @ApiBody({ type: SendEmailOtpDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @Post('email/resend-otp')
  resendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.authService.resendEmailOtp(dto);
  }

  @ApiOperation({ summary: 'Verify email OTP and login/signup' })
  @ApiBody({ type: VerifyEmailOtpDto })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired OTP' })
  @Post('email/verify-otp')
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.authService.verifyEmailOtp(dto);
  }

  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Send OTP to phone' })
  @ApiBody({ type: SendPhoneOtpDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @Post('phone/send-otp')
  sendPhoneOtp(@Body() dto: SendPhoneOtpDto) {
    return this.authService.sendPhoneOtp(dto);
  }

  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Resend OTP to phone' })
  @ApiBody({ type: SendPhoneOtpDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @Post('phone/resend-otp')
  resendPhoneOtp(@Body() dto: SendPhoneOtpDto) {
    return this.authService.resendPhoneOtp(dto);
  }

  @ApiOperation({ summary: 'Verify phone OTP and login/signup' })
  @ApiBody({ type: VerifyPhoneOtpDto })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired OTP' })
  @Post('phone/verify-otp')
  verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto) {
    return this.authService.verifyPhoneOtp(dto);
  }

  @ApiOperation({ summary: 'Admin login with email and password' })
  @ApiBody({ type: AdminLoginDto })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @Post('admin/login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.authService.adminLogin(dto);
  }

  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @ApiOperation({ summary: 'Request password reset email' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @ApiOperation({ summary: 'Reset password using email token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiOperation({ summary: 'Change password for logged-in user' })
  @ApiBearerAuth()
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.sub, dto);
  }

  @ApiOperation({ summary: 'Logout current user session' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: Request & { user: JwtPayload }) {
    return this.authService.logout(req.user.sub);
  }

  @ApiOperation({ summary: 'Protected admin-only route example' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: AdminProtectedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/protected')
  adminProtected() {
    return { message: 'Admin route is accessible' };
  }
}
