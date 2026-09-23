import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';
import type { LivenessStatus, ReadinessStatus } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health/live')
  getLiveness(): LivenessStatus {
    return this.appService.getLiveness();
  }

  @Get('health/ready')
  async getReadiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessStatus> {
    const readiness = await this.appService.getReadiness();
    if (readiness.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return readiness;
  }
}
