import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CancellationReasonService } from './cancellation-reason.service';

@ApiTags('Cancellation Reasons')
@Controller()
@SkipThrottle()
export class CancellationReasonController {
  constructor(private readonly service: CancellationReasonService) {}

  // ── Public ────────────────────────────────────────────────────────────────

  @Get('cancellation-reasons')
  @ApiOperation({ summary: 'List active cancellation reasons (for cancel modal)' })
  listActive() {
    return this.service.listActive();
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Get('admin/cancellation-reasons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List all cancellation reasons' })
  listAll() {
    return this.service.listAll();
  }

  @Post('admin/cancellation-reasons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Create a new cancellation reason' })
  create(@Body() body: { label: string; sortOrder?: number }) {
    return this.service.create(body.label, body.sortOrder);
  }

  @Patch('admin/cancellation-reasons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Update a cancellation reason' })
  update(
    @Param('id') id: string,
    @Body() body: { label?: string; isActive?: boolean; sortOrder?: number },
  ) {
    return this.service.update(id, body);
  }

  @Delete('admin/cancellation-reasons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Delete a cancellation reason' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
