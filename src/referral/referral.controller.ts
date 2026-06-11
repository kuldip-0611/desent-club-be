import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReferralService } from './referral.service';

@ApiTags('Referral')
@Controller()
@ApiBearerAuth()
@SkipThrottle()
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  // ── User ──────────────────────────────────────────────────────────────────

  @Get('referral/my')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my referral code and stats' })
  getMyCode(@Req() req: { user: { sub: string } }) {
    return this.referralService.getOrCreateCode(req.user.sub);
  }

  @Get('referral/my/stats')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get referral stats (who I referred)' })
  getStats(@Req() req: { user: { sub: string } }) {
    return this.referralService.getStats(req.user.sub);
  }

  @Post('referral/apply')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Apply a referral code to my account' })
  applyCode(
    @Req() req: { user: { sub: string } },
    @Body() body: { code: string },
  ) {
    return this.referralService.applyReferralCode(req.user.sub, body.code);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Get('admin/referrals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List all referral codes' })
  listAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.referralService.listAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }
}
