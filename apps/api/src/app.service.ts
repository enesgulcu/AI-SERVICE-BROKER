import { Injectable } from '@nestjs/common';

export interface LivenessStatus {
  service: 'api';
  status: 'ok';
  timestamp: string;
}

export interface ReadinessStatus extends LivenessStatus {
  checks: {
    configuration: 'ok';
  };
}

@Injectable()
export class AppService {
  getLiveness(): LivenessStatus {
    return {
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness(): ReadinessStatus {
    return {
      ...this.getLiveness(),
      checks: {
        configuration: 'ok',
      },
    };
  }
}
