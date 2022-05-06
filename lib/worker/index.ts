import db from '../db';
import * as log from '../common/logger';
import BaseJob from './jobs/Base';
import * as jobs from './jobs';

export class Worker {
  private jobs: {[type: string]: typeof BaseJob} = jobs;
  private nextRunDate: Date|null = null;
  private currentTimeout: NodeJS.Timeout|null = null;

  public start() {
    this.ping()
    .catch(err => {
      log.error(`Failed to run worker: ${err}`);
    });
  }

  public async addJob(job: JobDescription) {
    const jobClass = this.getJobClass(job.type);
    const { schedule, initDelayS } = jobClass;
    await db.jobs.insert({ ...job, schedule, initDelayS });
    this.start();
  }

  public async removeJobs(videoId: number) {
    await db.jobs.deleteForVideo(videoId);
    this.start();
  }

  private getJobClass(type: JobType) {
    return this.jobs[type];
  }

  // Do not await
  private async ping() {
    const nextJob = await db.jobs.getNext();
    if (nextJob && (!this.nextRunDate || nextJob.nextRunAt < this.nextRunDate)) {
      clearTimeout(this.currentTimeout!);
      this.nextRunDate = nextJob.nextRunAt;
      this.currentTimeout = setTimeout(async () => this.runJob(nextJob),
        this.nextRunDate.getTime() - Date.now());
    }
  }

  private async runJob(job: DBJob) {
    this.nextRunDate = null;
    this.currentTimeout = null;
    const result = await this.jobs[job.type].run(job.videoId);
    if (!result) {
      // Reschedule repeat jobs on failure
      await db.jobs.reschedule(job);
      this.start();
    }
  }
}

export default new Worker();
