import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StoreCreditService } from './store-credit.service';

@ApiTags('Store Credit')
@Controller('store-credit')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@SkipThrottle()
export class StoreCreditController {
  constructor(private readonly service: StoreCreditService) {}

  @Get('my')
  @ApiOperation({ summary: 'Get my store credit balance & transaction history' })
  getMyCredit(@Req() req: { user: { sub: string } }) {
    return this.service.getAccount(req.user.sub);
  }

  @Get('my/balance')
  @ApiOperation({ summary: 'Get my store credit balance (lightweight)' })
  async getBalance(@Req() req: { user: { sub: string } }) {
    const balance = await this.service.getBalance(req.user.sub);
    return { balance };
  }
}
