import { Global, Module } from '@nestjs/common';
import { ShiprocketService } from './shiprocket.service';
import { ShiprocketSyncService } from './shiprocket-sync.service';
import { MailModule } from '../mail/mail.module';

@Global()
@Module({
  imports: [MailModule],
  providers: [ShiprocketService, ShiprocketSyncService],
  exports: [ShiprocketService],
})
export class ShiprocketModule {}
