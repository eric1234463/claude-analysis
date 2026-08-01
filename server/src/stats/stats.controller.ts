import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { AggregateStats } from './contracts';
import { StatsService } from './stats.service';

@Controller('api')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('stats')
  getStats(): Promise<AggregateStats> {
    return this.statsService.getStats();
  }

  @Post('stats/refresh')
  @HttpCode(200)
  refresh(): Promise<AggregateStats> {
    return this.statsService.refresh();
  }
}
