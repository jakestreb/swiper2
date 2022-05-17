import db from '../db';
import * as log from '../common/logger';
import BaseJob from './jobs/Base';
import * as jobs from './jobs';
import Swiper from '../Swiper';

export default class Worker {
  private jobs: {[type: string]: typeof BaseJob} = jobs;
  private nextRunTs: number|null = null;
  private currentTimeout: NodeJS.Timeout|null = null;

  private pingInProgress: boolean = false;
  private pingLock: Promise<any>;

  constructor(public swiper: Swiper) {}

  public start() {
    this.ping()
    .catch(err => {
      log.error(`Failed to run worker: ${err}`);
    });
  }

  public async addJob(job: JobDescription) {
    const JobClass = this.getJobClass(job.type);
    const { schedule, initDelayS } = JobClass;
    await db.jobs.insert({ ...job, schedule, initDelayS });
    this.start();
  }

  public async removeJobs(videoId: number) {
    await db.jobs.deleteForVideo(videoId);
  }

  private getJobClass(type: JobType) {
    return this.jobs[type];
  }

  // Do not await
  private async ping() {
    await this.pingLock;
    // If after waiting, the ping is in process again, the goal of the ping
    // is already being accomplished, so this ping can return.
    if (!this.pingInProgress) {
      this.pingInProgress = true;
      this.pingLock = db.jobs.getNext();
      const nextJob: DBJob = await this.pingLock;
      if (nextJob && (!this.nextRunTs || nextJob.nextRunAt < this.nextRunTs)) {
        clearTimeout(this.currentTimeout!);
        this.nextRunTs = nextJob.nextRunAt;
        this.currentTimeout = setTimeout(async () => this.runJob(nextJob),
          this.nextRunTs - Date.now());
      }
      this.pingInProgress = false;
    }
  }

  private async runJob(job: DBJob) {
    log.debug(`Running ${job.type} job ${job.videoId}`);
    await db.jobs.markDone(job.id);
    this.nextRunTs = null;
    this.currentTimeout = null;
    this.doRunJob(job)
      .catch(err => {
        log.error(`Failed to run ${job.type} job ${job.videoId}: ${err}`);
      });
    this.start();
  }

  private async doRunJob(job: DBJob): Promise<void> {
    if (!await db.jobs.getOne(job.id)) {
      // Check if the job was since removed
      return;
    }
    const JobClass = this.getJobClass(job.type);
    const jobInst = new JobClass(this, this.swiper);
    let success = false;
    try {
      success = await jobInst.run(job.videoId, job.runCount);
      if (!success && JobClass.schedule !== 'once') {
        log.debug(`Rescheduling ${job.type} job ${job.videoId}`);
        // Reschedule repeat jobs on failure
        await db.jobs.reschedule(job);
        this.start();
      }
    } catch (err) {
      log.error(`Error running ${job.type} job ${job.videoId}: ${err}`);
      // Reschedule all jobs on error
      await db.jobs.reschedule(job);
      this.start();
    }
  }
}
