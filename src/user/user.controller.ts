import {
  BadRequestException,
  Body,
  Controller,
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
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { profileImageMulterOptions } from './multer.config';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('admin/users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List users for admin panel' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.userService.listForAdmin(query);
  }

  @Patch('admin/users/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user role/verification as admin' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserAdminDto) {
    return this.userService.updateByAdmin(id, dto);
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
