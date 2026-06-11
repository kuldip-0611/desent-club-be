import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  // ── User endpoints ────────────────────────────────────────────────────────

  @Get('notifications')
  @ApiOperation({ summary: 'List notifications for current user' })
  list(@Request() req: { user: { sub: string } }, @Query('unread') unread?: string) {
    return this.svc.listForUser(req.user.sub, unread === 'true');
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Count unread notifications' })
  unreadCount(@Request() req: { user: { sub: string } }) {
    return this.svc.countUnread(req.user.sub).then((count) => ({ count }));
  }

  @Patch('notifications/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@Request() req: { user: { sub: string } }) {
    return this.svc.markAllRead(req.user.sub);
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(@Request() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.svc.markRead(id, req.user.sub);
  }

  @Delete('notifications/:id')
  @ApiOperation({ summary: 'Delete a notification' })
  deleteOne(@Request() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.svc.deleteOne(id, req.user.sub);
  }

  // ── Admin broadcast ───────────────────────────────────────────────────────

  @Post('admin/notifications/broadcast')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Send broadcast notification to all users (inbox + push + optional email)' })
  async broadcast(
    @Body() body: {
      title: string;
      body: string;
      type?: string;
      sendEmail?: boolean;
      data?: Record<string, unknown>;
    },
  ) {
    if (!body.title?.trim()) throw new BadRequestException('title is required');
    if (!body.body?.trim()) throw new BadRequestException('body is required');

    const result = await this.svc.broadcastToAll({
      title: body.title.trim(),
      body: body.body.trim(),
      type: body.type ?? 'general',
      sendEmail: body.sendEmail ?? false,
      data: body.data,
    });

    return {
      message: `Broadcast sent to ${result.sent} users (${result.pushed} push notifications, ${result.emailed} emails)`,
      ...result,
    };
  }
}
