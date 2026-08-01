import { Module } from '@nestjs/common';
import { JsonFileAggregateCache } from './stats/file-cache';
import { loadConfig } from './stats/config';
import { TranscriptStatsPipeline } from './stats/pipeline';
import { StatsModule } from './stats/stats.module';
import { APP_CONFIG, STATS_PIPELINE } from './stats/contracts';

@Module({
  imports: [StatsModule],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig(process.env) },
    {
      provide: STATS_PIPELINE,
      useFactory: (config: ReturnType<typeof loadConfig>) =>
        new TranscriptStatsPipeline(config, new JsonFileAggregateCache(config.cacheFile)),
      inject: [APP_CONFIG],
    },
  ],
})
export class AppModule {}
