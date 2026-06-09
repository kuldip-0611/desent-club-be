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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AssignCouponToGroupDto } from '../user/dto/assign-coupon-to-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateUserGroupDto } from './dto/create-user-group.dto';
import { UpdateUserGroupDto } from './dto/update-user-group.dto';
import { UserGroupService } from './user-group.service';

@ApiTags('User groups')
@Controller('admin/user-groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UserGroupController {
  constructor(private readonly userGroupService: UserGroupService) {}

  @Get()
  @ApiOperation({ summary: 'List user groups' })
  list() {
    return this.userGroupService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create user group' })
  create(@Body() dto: CreateUserGroupDto) {
    return this.userGroupService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user group with members' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userGroupService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user group' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserGroupDto,
  ) {
    return this.userGroupService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user group' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.userGroupService.remove(id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add user to group' })
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.userGroupService.addMember(id, dto.userId);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove user from group' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.userGroupService.removeMember(id, userId);
  }

  @Post(':id/coupons')
  @ApiOperation({ summary: 'Assign coupon to all members of group' })
  assignCoupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCouponToGroupDto,
  ) {
    return this.userGroupService.assignCoupon(id, dto.couponId);
  }

  @Delete(':id/coupons/:couponId')
  @ApiOperation({ summary: 'Remove coupon from group' })
  unassignCoupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('couponId', ParseUUIDPipe) couponId: string,
  ) {
    return this.userGroupService.unassignCoupon(id, couponId);
  }
}
