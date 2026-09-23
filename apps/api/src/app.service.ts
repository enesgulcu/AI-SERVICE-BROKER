import { Injectable } from '@nestjs/common';

export interface LivenessStatus {
  service: 'api';
  status: 'ok';
  timestamp: string;
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
}
