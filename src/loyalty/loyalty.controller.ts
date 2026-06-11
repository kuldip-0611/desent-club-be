import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LoyaltyService, LOYALTY_RULES } from './loyalty.service';

@ApiTags('Loyalty')
@Controller()
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@SkipThrottle()
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // ── User ──────────────────────────────────────────────────────────────────

  @Get('loyalty/my')
  @ApiOperation({ summary: 'Get my loyalty account & transaction history' })
  getMyAccount(@Req() req: { user: { sub: string } }) {
    return this.loyaltyService.getAccount(req.user.sub);
  }

  @Get('loyalty/rules')
  @ApiOperation({ summary: 'Get loyalty program rules' })
  getRules() {
    return LOYALTY_RULES;
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Get('admin/loyalty')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List all loyalty accounts' })
  listAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.loyaltyService.listAccounts(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Patch('admin/loyalty/:userId/adjust')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Manually adjust user loyalty points' })
  adjust(
    @Param('userId') userId: string,
    @Body() body: { points: number; reason: string },
  ) {
    return this.loyaltyService.adjustPoints(userId, body.points, body.reason);
  }
}
