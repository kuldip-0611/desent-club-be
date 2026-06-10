import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  @Get('notifications')
  list(@Request() req: any, @Query('unread') unread?: string) {
    return this.svc.listForUser(req.user.sub, unread === 'true');
  }

  @Get('notifications/unread-count')
  unreadCount(@Request() req: any) {
    return this.svc.countUnread(req.user.sub).then((count) => ({ count }));
  }

  @Patch('notifications/read-all')
  markAllRead(@Request() req: any) {
    return this.svc.markAllRead(req.user.sub);
  }

  @Patch('notifications/:id/read')
  markRead(@Request() req: any, @Param('id') id: string) {
    return this.svc.markRead(id, req.user.sub);
  }

  @Delete('notifications/:id')
  deleteOne(@Request() req: any, @Param('id') id: string) {
    return this.svc.deleteOne(id, req.user.sub);
  }
}
