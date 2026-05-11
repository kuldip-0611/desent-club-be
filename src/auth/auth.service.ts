import {
  BadRequestException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProviderType, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserLoginDto } from './dto/user-login.dto';
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { SendPhoneOtpDto } from './dto/send-phone-otp.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { MockGoogleService } from './services/mock-google.service';
import { OtpMailService } from './services/otp-mail.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    profileImage: string | null;
    role: UserRole;
    isVerified: boolean;
    provider: AuthProviderType;
  };
}

interface OtpRateLimit {
  count: number;
  windowStart: number;
}

@Injectable()
export class AuthService {
  private readonly otpTtlMs = 5 * 60 * 1000;
  private readonly otpRateLimitWindowMs = 60 * 1000;
  private readonly otpRateLimitMax = 3;
  private readonly otpRateLimitMap = new Map<string, OtpRateLimit>();

  constructor(
    private readonly prismaService: PrismaService,
    private readonly userService: UserService,
    private readonly otpMailService: OtpMailService,
    private readonly mockGoogleService: MockGoogleService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async loginWithGoogle(dto: GoogleLoginDto): Promise<AuthTokens> {
    const identity = await this.mockGoogleService.verifyGoogleToken(dto.token);
    let user = await this.userService.findByEmail(identity.email);

    if (!user) {
      user = await this.userService.createUser({
        name: dto.name ?? identity.name,
        email: identity.email,
        provider: AuthProviderType.GOOGLE,
        isVerified: true,
      });
    } else if (!user.isVerified) {
      user = await this.prismaService.user.update({
        where: { id: user.id },
        data: { isVerified: true },
      });
    }

    await this.prismaService.authProvider.upsert({
      where: {
        provider_providerId: {
          provider: AuthProviderType.GOOGLE,
          providerId: identity.providerId,
        },
      },
      create: {
        provider: AuthProviderType.GOOGLE,
        providerId: identity.providerId,
        userId: user.id,
      },
      update: { userId: user.id },
    });

    return this.issueTokens(user);
  }

  async register(dto: RegisterDto): Promise<{ message: string }> {
    this.assertAllowedRegistrationEmailDomain(dto.email);
    const existing = await this.userService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    await this.userService.createUser({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      provider: AuthProviderType.EMAIL,
      isVerified: false,
      role: UserRole.USER,
    });

    await this.sendOtp(dto.email, 'email');
    return {
      message: 'Account created. Check your email for the verification code.',
    };
  }

  async userLogin(dto: UserLoginDto): Promise<AuthTokens> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user || user.role === UserRole.ADMIN) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens(user);
  }

  async sendEmailOtp(dto: SendEmailOtpDto): Promise<{ message: string }> {
    this.assertAllowedRegistrationEmailDomain(dto.email);
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new BadRequestException(
        'Create an account before requesting a verification code.',
      );
    }
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Use admin login for this account.');
    }
    if (user.isVerified) {
      throw new BadRequestException(
        'This email is already verified. Please log in.',
      );
    }
    if (!user.password) {
      throw new BadRequestException(
        'Complete registration to receive a verification code.',
      );
    }

    await this.sendOtp(dto.email, 'email');
    return { message: 'OTP sent to email' };
  }

  async resendEmailOtp(dto: SendEmailOtpDto): Promise<{ message: string }> {
    return this.sendEmailOtp(dto);
  }

  async verifyEmailOtp(dto: VerifyEmailOtpDto): Promise<AuthTokens> {
    this.assertAllowedRegistrationEmailDomain(dto.email);
    await this.verifyOtp(dto.email, dto.otp);
    const existingUser = await this.userService.findByEmail(dto.email);
    if (!existingUser) {
      throw new BadRequestException(
        'No account found for this email. Please register first.',
      );
    }

    if (existingUser.role === UserRole.ADMIN) {
      throw new BadRequestException('Use admin login for this account.');
    }

    if (!existingUser.password) {
      const user = await this.prismaService.user.update({
        where: { id: existingUser.id },
        data: {
          isVerified: true,
          provider: AuthProviderType.EMAIL,
          ...(dto.name ? { name: dto.name } : {}),
        },
      });
      return this.issueTokens(user);
    }

    if (existingUser.isVerified) {
      throw new BadRequestException(
        'This email is already verified. Please log in.',
      );
    }

    const user = await this.prismaService.user.update({
      where: { id: existingUser.id },
      data: {
        isVerified: true,
        provider: AuthProviderType.EMAIL,
        ...(dto.name ? { name: dto.name } : {}),
      },
    });

    return this.issueTokens(user);
  }

  async sendPhoneOtp(dto: SendPhoneOtpDto): Promise<{ message: string }> {
    await this.sendOtp(dto.phone, 'phone');
    return { message: 'OTP sent to phone' };
  }

  async resendPhoneOtp(dto: SendPhoneOtpDto): Promise<{ message: string }> {
    await this.sendOtp(dto.phone, 'phone');
    return { message: 'OTP resent to phone' };
  }

  async verifyPhoneOtp(dto: VerifyPhoneOtpDto): Promise<AuthTokens> {
    await this.verifyOtp(dto.phone, dto.otp);
    const existingUser = await this.userService.findByPhone(dto.phone);
    const user = existingUser
      ? await this.prismaService.user.update({
          where: { id: existingUser.id },
          data: {
            isVerified: true,
            provider: AuthProviderType.PHONE,
            ...(dto.name ? { name: dto.name } : {}),
          },
        })
      : await this.userService.createUser({
          name: dto.name ?? `user_${dto.phone.slice(-4)}`,
          phone: dto.phone,
          provider: AuthProviderType.PHONE,
          isVerified: true,
        });

    return this.issueTokens(user);
  }

  async adminLogin(dto: AdminLoginDto): Promise<AuthTokens> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user || user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Invalid email');
    }

    if (!user.password) {
      throw new UnauthorizedException('Please Enter Password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    return this.issueTokens(user);
  }

  async refreshToken(dto: RefreshTokenDto): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const user = await this.userService.findById(payload.sub);
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      dto.refreshToken,
      user.refreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.userService.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully' };
  }

  async createAdmin(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<User> {
    const existingAdmin = await this.userService.findByEmail(input.email);
    if (existingAdmin) {
      throw new BadRequestException('Admin already exists for this email');
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);
    return this.userService.createUser({
      name: input.name,
      email: input.email,
      password: hashedPassword,
      role: UserRole.ADMIN,
      provider: AuthProviderType.EMAIL,
      isVerified: true,
    });
  }

  private async sendOtp(
    identifier: string,
    channel: 'email' | 'phone',
  ): Promise<void> {
    this.assertOtpRateLimit(identifier);
    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + this.otpTtlMs);

    await this.prismaService.otp.create({
      data: { identifier, otp, expiresAt },
    });

    if (channel === 'email') {
      await this.otpMailService.sendEmailOtp(identifier, otp);
      return;
    }

    await this.otpMailService.sendPhoneOtp(identifier, otp);
  }

  private assertAllowedRegistrationEmailDomain(email: string): void {
    const raw = this.configService.get<string>('ALLOWED_EMAIL_DOMAINS');
    if (!raw?.trim()) {
      return;
    }

    const allowed = raw
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length === 0) {
      return;
    }

    const at = email.lastIndexOf('@');
    const domain = at >= 0 ? email.slice(at + 1).toLowerCase() : '';
    if (!allowed.includes(domain)) {
      throw new BadRequestException(
        'This email domain is not allowed for sign-up',
      );
    }
  }

  private async verifyOtp(identifier: string, otp: string): Promise<void> {
    const otpRecord = await this.prismaService.otp.findFirst({
      where: {
        identifier,
        otp,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.prismaService.otp.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private assertOtpRateLimit(identifier: string): void {
    const now = Date.now();
    const current = this.otpRateLimitMap.get(identifier);

    if (!current || now - current.windowStart > this.otpRateLimitWindowMs) {
      this.otpRateLimitMap.set(identifier, { count: 1, windowStart: now });
      return;
    }

    if (current.count >= this.otpRateLimitMax) {
      throw new HttpException(
        'Too many OTP requests, please try again later',
        429,
      );
    }

    this.otpRateLimitMap.set(identifier, {
      count: current.count + 1,
      windowStart: current.windowStart,
    });
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    const accessTokenTtl = Number(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN_SECONDS') ?? 900,
    );
    const refreshTokenTtl = Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_SECONDS') ??
        604800,
    );

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTokenTtl,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTokenTtl,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userService.updateRefreshToken(user.id, hashedRefreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage ?? null,
        role: user.role,
        isVerified: user.isVerified,
        provider: user.provider,
      },
    };
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
