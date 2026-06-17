import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UPLOAD_SETTINGS_RESPONSE } from '../common/upload-settings';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  @Get('basic')
  @ApiOperation({ summary: 'Basic public app/upload settings' })
  getBasicSettings() {
    return {
      appName: 'Disent Club',
      uploads: UPLOAD_SETTINGS_RESPONSE,
    };
  }
}
