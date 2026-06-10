import { Global, Module } from '@nestjs/common';
import { ShiprocketService } from './shiprocket.service';

@Global()
@Module({
  providers: [ShiprocketService],
  exports: [ShiprocketService],
})
export class ShiprocketModule {}
