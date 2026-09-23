import { Module } from '@nestjs/common';
import { OutboxDrain } from './outbox-drain';

@Module({
  providers: [OutboxDrain],
})
export class AppModule {}
