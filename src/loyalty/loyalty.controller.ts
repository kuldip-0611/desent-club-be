import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LoyaltyService, LOYALTY_RULES } from './loyalty.service';
import { AdjustPointsDto } from './dto/adjust-points.dto';

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
  @ApiOperation({
    summary: '[Admin] Manually adjust user loyalty points',
    description:
      'Add (positive) or deduct (negative) points from a user\'s loyalty account. ' +
      'Cannot deduct more than the user\'s current balance. Returns before/after snapshot.',
  })
  @ApiParam({ name: 'userId', description: 'The user\'s ID' })
  @ApiBody({ type: AdjustPointsDto })
  @ApiResponse({
    status: 200,
    description: 'Points adjusted successfully',
    schema: {
      example: {
        userId: 'clxyz123',
        previousBalance: 250,
        adjustedBy: 100,
        newBalance: 350,
        transactionId: 'clxyz456',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Points is zero or deduction exceeds balance' })
  @ApiResponse({ status: 404, description: 'User not found' })
  adjust(
    @Param('userId') userId: string,
    @Body() dto: AdjustPointsDto,
  ) {
    return this.loyaltyService.adjustPoints(userId, dto.points, dto.reason, dto.adminNote);
  }

  @Get('admin/loyalty/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Get loyalty account for a specific user' })
  @ApiParam({ name: 'userId', description: 'The user\'s ID' })
  getUserAccount(@Param('userId') userId: string) {
    return this.loyaltyService.getAccount(userId);
  }
}
