import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Request } from 'express';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller()
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get('admin/audit-logs')
  findAll(
    @Req() req: Request & { user: JwtPayload },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('adminId') adminId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditLog.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      action,
      targetType,
      adminId,
      from,
      to,
    });
  }
}
