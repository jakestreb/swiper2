import db from '../db';
import * as log from '../common/logger';
import BaseJob from './jobs/Base';
import * as jobs from './jobs';

export class Worker {
  private jobs: {[type: string]: BaseJob} = jobs;
  private nextRunDate: Date|null = null;
  private currentTimeout: NodeJS.Timeout|null = null;

  public start() {
    this.ping()
    .catch(err => {
      log.error(`Failed to run worker: ${err}`);
    });
  }

  public async addJob(job: JobDescription) {
    await db.jobs.insert(job);
    this.start();
  }

  public async removeJobs(videoId: number) {
    await db.jobs.deleteForVideo(videoId);
    this.start();
  }

  // Do not await
  private async ping() {
    const nextJob = await db.jobs.getNext();
    if (nextJob && (!this.nextRunDate || nextJob.runAt < this.nextRunDate)) {
      clearTimeout(this.currentTimeout!);
      this.nextRunDate = nextJob.runAt;
      this.currentTimeout = setTimeout(async () => this.runJob(nextJob),
        this.nextRunDate.getTime() - Date.now());
    }
  }

  private async runJob(job: DBJob) {
    this.nextRunDate = null;
    this.currentTimeout = null;
    const result = await this.jobs[job.type].run(job.videoId);
    if (!result && job.schedule !== 'once') {
      // Reschedule repeat jobs on failure
      await db.jobs.insert(job);
      this.start();
    }
  }
}

export default new Worker();
