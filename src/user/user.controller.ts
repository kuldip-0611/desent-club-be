import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AssignUserCouponDto } from './dto/assign-user-coupon.dto';
import { CreateUserAddressDto } from './dto/create-user-address.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserAddressDto } from './dto/update-user-address.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { ValidateUserCouponDto } from './dto/validate-user-coupon.dto';
import { profileImageMulterOptions } from './multer.config';
import { UserAddressService } from './user-address.service';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller()
@SkipThrottle()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userAddressService: UserAddressService,
  ) {}

  @Get('admin/users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List users for admin panel' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.userService.listForAdmin(query);
  }

  @Get('admin/users/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user detail with groups and coupons' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.getAdminDetail(id);
  }

  @Get('admin/users/:id/available-coupons')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List coupons available for a user' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listAvailableCoupons(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.listAvailableCouponsForUser(id);
  }

  @Post('admin/users/:id/coupons')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign coupon directly to user' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  assignCoupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserCouponDto,
  ) {
    return this.userService.assignCouponToUser(id, dto.couponId);
  }

  @Delete('admin/users/:id/coupons/:couponId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove direct coupon assignment from user' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  unassignCoupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('couponId', ParseUUIDPipe) couponId: string,
  ) {
    return this.userService.unassignCouponFromUser(id, couponId);
  }

  @Post('admin/users/:id/validate-coupon')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate coupon for a specific user' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  validateCoupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateUserCouponDto,
  ) {
    return this.userService.validateCouponForUser(
      id,
      dto.code,
      dto.subtotal ?? 0,
      dto.categoryIds,
    );
  }

  @Patch('admin/users/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user role/verification as admin' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserAdminDto) {
    return this.userService.updateByAdmin(id, dto);
  }

  @Get('users/me/addresses')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List saved addresses for current user' })
  @UseGuards(JwtAuthGuard)
  listMyAddresses(@Req() req: Request & { user: JwtPayload }) {
    return this.userAddressService.listForUser(req.user.sub);
  }

  @Post('users/me/addresses')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a saved address' })
  @UseGuards(JwtAuthGuard)
  createMyAddress(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: CreateUserAddressDto,
  ) {
    return this.userAddressService.createForUser(req.user.sub, dto);
  }

  @Patch('users/me/addresses/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a saved address' })
  @UseGuards(JwtAuthGuard)
  updateMyAddress(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserAddressDto,
  ) {
    return this.userAddressService.updateForUser(req.user.sub, id, dto);
  }

  @Patch('users/me/addresses/:id/default')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set default address' })
  @UseGuards(JwtAuthGuard)
  setDefaultMyAddress(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userAddressService.setDefault(req.user.sub, id);
  }

  @Delete('users/me/addresses/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a saved address' })
  @UseGuards(JwtAuthGuard)
  deleteMyAddress(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userAddressService.deleteForUser(req.user.sub, id);
  }

  @Post('users/me/fcm-token')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register or update FCM push token for current user' })
  @UseGuards(JwtAuthGuard)
  saveFcmToken(
    @Req() req: Request & { user: JwtPayload },
    @Body('token') token: string,
  ) {
    if (!token) throw new BadRequestException('token is required');
    return this.userService.saveFcmToken(req.user.sub, token).then(() => ({ success: true }));
  }

  @Post('users/me/profile-image')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload current user profile image' })
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', profileImageMulterOptions))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadProfileImage(
    @Req() req: Request & { user: JwtPayload },
    @UploadedFile() image?: Express.Multer.File,
  ) {
    if (!image) throw new BadRequestException('Profile image is required');
    const existing = await this.userService.findById(req.user.sub);
    if (!existing) throw new NotFoundException('User not found');
    const path = `/uploads/profiles/${image.filename}`;
    const updated = await this.userService.updateProfileImage(req.user.sub, path);
    return {
      id: updated.id,
      profileImage: updated.profileImage,
    };
  }
}
