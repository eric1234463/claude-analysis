import { Inject, Injectable } from '@nestjs/common';
import { STATS_PIPELINE, type AggregateStats, type StatsPipeline } from './contracts';

@Injectable()
export class StatsService {
  private lastGood: AggregateStats | undefined;
  private inFlight: Promise<AggregateStats> | undefined;

  constructor(@Inject(STATS_PIPELINE) private readonly pipeline: StatsPipeline) {}

  /** Returns the last successfully computed aggregate if one exists, otherwise performs a refresh. */
  getStats(): Promise<AggregateStats> {
    if (this.lastGood !== undefined) {
      return Promise.resolve(this.lastGood);
    }
    return this.refresh();
  }

  /** Single-flight: while a run is in progress, every concurrent caller receives the same
   *  promise and the pipeline is invoked exactly once. On success the result is retained as the
   *  last-good aggregate. On rejection the in-flight promise is cleared so the next call retries,
   *  and the rejection propagates to every joined caller. */
  refresh(): Promise<AggregateStats> {
    if (this.inFlight !== undefined) {
      return this.inFlight;
    }
    const run = this.pipeline.run().then(
      (result) => {
        this.lastGood = result;
        this.inFlight = undefined;
        return result;
      },
      (err) => {
        this.inFlight = undefined;
        throw err;
      },
    );
    this.inFlight = run;
    return run;
  }
}
