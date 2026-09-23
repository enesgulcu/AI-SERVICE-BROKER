import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  READINESS_PROBE,
  type ReadinessProbe,
} from './platform/health/readiness';

export interface LivenessStatus {
  service: 'api';
  status: 'ok';
  timestamp: string;
}

export interface ReadinessStatus {
  service: 'api';
  status: 'ok' | 'unavailable';
  timestamp: string;
  checks: {
    configuration: 'ok';
    database: 'ok' | 'skipped' | 'unavailable';
  };
}

@Injectable()
export class AppService {
  constructor(
    @Optional()
    @Inject(READINESS_PROBE)
    private readonly readinessProbe?: ReadinessProbe,
  ) {}

  getLiveness(): LivenessStatus {
    return {
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessStatus> {
    const database = this.readinessProbe
      ? await this.readinessProbe.checkDatabase()
      : 'skipped';
    return {
      ...this.getLiveness(),
      status: database === 'unavailable' ? 'unavailable' : 'ok',
      checks: {
        configuration: 'ok',
        database,
      },
    };
  }
}
