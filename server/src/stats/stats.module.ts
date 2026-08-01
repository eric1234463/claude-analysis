import { Module } from '@nestjs/common';
import { APP_CONFIG, STATS_PIPELINE } from './contracts';
import { loadConfig } from './config';
import { JsonFileAggregateCache } from './file-cache';
import { TranscriptStatsPipeline } from './pipeline';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  controllers: [StatsController],
  providers: [
    StatsService,
    { provide: APP_CONFIG, useFactory: () => loadConfig(process.env) },
    {
      provide: STATS_PIPELINE,
      useFactory: (config: ReturnType<typeof loadConfig>) =>
        new TranscriptStatsPipeline(config, new JsonFileAggregateCache(config.cacheFile)),
      inject: [APP_CONFIG],
    },
  ],
  exports: [StatsService, APP_CONFIG, STATS_PIPELINE],
})
export class StatsModule {}
