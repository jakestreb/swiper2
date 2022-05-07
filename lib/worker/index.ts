import db from '../db';
import * as log from '../common/logger';
import BaseJob from './jobs/Base';
import * as jobs from './jobs';
import Swiper from '../Swiper';

export default class Worker {
  private jobs: {[type: string]: typeof BaseJob} = jobs;
  private nextRunTs: number|null = null;
  private currentTimeout: NodeJS.Timeout|null = null;

  constructor(public swiper: Swiper) {}

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
    if (nextJob && (!this.nextRunTs || nextJob.nextRunAt < this.nextRunTs)) {
      clearTimeout(this.currentTimeout!);
      this.nextRunTs = nextJob.nextRunAt;
      this.currentTimeout = setTimeout(async () => this.runJob(nextJob),
        this.nextRunTs - Date.now());
    }
  }

  private async runJob(job: DBJob) {
    log.debug(`Running ${job.type} job: ${job.videoId}`);
    this.nextRunTs = null;
    this.currentTimeout = null;
    const jobInst = new this.jobs[job.type](this, this.swiper);
    const success = jobInst.run(job.videoId);
    if (!success) {
      // Reschedule repeat jobs on failure
      await db.jobs.reschedule(job);
      this.start();
    }
  }
}
