import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CouponService } from './coupon.service';
import {
  AssignCouponUserDto,
  AssignCouponUserGroupDto,
} from './dto/assign-coupon-audience.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@ApiTags('Admin - Coupons')
@Controller('admin/coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class CouponAdminController {
  constructor(
    private readonly couponService: CouponService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List coupons' })
  findAll() {
    return this.couponService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get coupon by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.couponService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create coupon' })
  async create(
    @Req() req: Request & { user: JwtPayload; ip: string },
    @Body() dto: CreateCouponDto,
  ) {
    const result = await this.couponService.create(dto);
    void this.auditLog.log({
      ctx: { adminId: req.user.sub, ipAddress: req.ip },
      action: 'COUPON_CREATED',
      targetType: 'COUPON',
      targetId: (result as { id?: string })?.id,
      targetLabel: dto.code,
    });
    return result;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update coupon' })
  async update(
    @Req() req: Request & { user: JwtPayload; ip: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    const result = await this.couponService.update(id, dto);
    void this.auditLog.log({
      ctx: { adminId: req.user.sub, ipAddress: req.ip },
      action: 'COUPON_UPDATED',
      targetType: 'COUPON',
      targetId: id,
      targetLabel: dto.code,
    });
    return result;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete coupon' })
  async remove(
    @Req() req: Request & { user: JwtPayload; ip: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.couponService.remove(id);
    void this.auditLog.log({
      ctx: { adminId: req.user.sub, ipAddress: req.ip },
      action: 'COUPON_DELETED',
      targetType: 'COUPON',
      targetId: id,
    });
    return { ok: true };
  }

  @Post(':id/users')
  @ApiOperation({ summary: 'Restrict coupon to a user' })
  async assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCouponUserDto,
  ) {
    await this.couponService.assignCouponToUser(id, dto.userId);
    return this.couponService.findOne(id);
  }

  @Delete(':id/users/:userId')
  @ApiOperation({ summary: 'Remove user restriction' })
  async unassignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.couponService.unassignCouponFromUser(id, userId);
    return this.couponService.findOne(id);
  }

  @Post(':id/user-groups')
  @ApiOperation({ summary: 'Restrict coupon to a user group' })
  async assignGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCouponUserGroupDto,
  ) {
    await this.couponService.assignCouponToGroup(id, dto.userGroupId);
    return this.couponService.findOne(id);
  }

  @Delete(':id/user-groups/:userGroupId')
  @ApiOperation({ summary: 'Remove user group restriction' })
  async unassignGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userGroupId', ParseUUIDPipe) userGroupId: string,
  ) {
    await this.couponService.unassignCouponFromGroup(id, userGroupId);
    return this.couponService.findOne(id);
  }
}
