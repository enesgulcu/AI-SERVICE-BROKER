import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { LivenessStatus } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health/live')
  getLiveness(): LivenessStatus {
    return this.appService.getLiveness();
  }
}
