import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
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
  constructor(private readonly couponService: CouponService) {}

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
  create(@Body() dto: CreateCouponDto) {
    return this.couponService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update coupon' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.couponService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete coupon' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.couponService.remove(id);
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
