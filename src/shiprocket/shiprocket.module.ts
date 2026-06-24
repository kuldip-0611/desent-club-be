import { Global, Module } from '@nestjs/common';
import { ShiprocketService } from './shiprocket.service';
import { ShiprocketSyncService } from './shiprocket-sync.service';

@Global()
@Module({
  providers: [ShiprocketService, ShiprocketSyncService],
  exports: [ShiprocketService],
})
export class ShiprocketModule {}
