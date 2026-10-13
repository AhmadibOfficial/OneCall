import { Controller, Get } from '@nestjs/common';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
  ) {}

  @Get()
  async getHealth() {
    return this.healthService.check();
  }

  @Get('live')
  live() {
    return {
      status: 'alive',
    };
  }

  @Get('ready')
  async ready() {
    return this.healthService.check();
  }
}