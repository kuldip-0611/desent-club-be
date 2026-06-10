import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('Admin - Dashboard')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get admin dashboard overview stats and recent products' })
  overview() {
    return this.dashboardService.getOverview();
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Revenue, orders, users charts + top products' })
  analytics(@Query('period') period?: 'daily' | 'weekly' | 'monthly') {
    return this.dashboardService.getAnalytics(period ?? 'daily');
  }
}
