import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UPLOAD_SETTINGS_RESPONSE } from '../common/upload-settings';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('basic')
  @ApiOperation({ summary: 'Basic public app/upload settings' })
  getBasicSettings() {
    return {
      appName: 'Disent Club',
      uploads: UPLOAD_SETTINGS_RESPONSE,
    };
  }

  @Get('public')
  @ApiOperation({ summary: 'Public store config (GST rate, free shipping threshold)' })
  async getPublicSettings() {
    const all = await this.settingsService.getAll();
    return {
      defaultGstRate: all.defaultGstRate,
      freeShippingThreshold: all.freeShippingThreshold,
      currency: all.currency,
      storeName: all.storeName,
    };
  }

  @Get('store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getStoreSettings() {
    return this.settingsService.getAll();
  }

  @Patch('store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateStoreSettings(@Body() body: Record<string, string>) {
    return this.settingsService.updateMany(body);
  }
}
