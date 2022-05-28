import db from '../db';
import * as log from '../log';
import BaseJob from './jobs/Base';
import * as jobs from './jobs';
import Swiper from '../Swiper';

const oneDay = 24 * 60 * 60 * 1000;

export default class Worker {
  private jobs: {[type: string]: typeof BaseJob} = jobs;
  private nextRun: Date|null = null;
  private currentTimeout: NodeJS.Timeout|null = null;

  private pingInProgress: boolean = false;
  private pingLock: Promise<IJob|void>;

  private isInit = false;

  constructor(public swiper: Swiper) {}

  public start() {
    this.ping()
    .catch(err => {
      log.error(`Failed to run worker: ${err}`);
    });
  }

  public async addJob(job: JobDescription) {
    log.debug(`Adding ${job.type} job ${job.videoId}`);
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
    if (!this.isInit) {
      // If the process exited when jobs were running, re-mark them as pending
      this.isInit = true;
      await db.jobs.markRunningAsPending();
    }

    await this.pingLock;
    // If after waiting, the ping is in process again, the goal of the ping
    // is already being accomplished, so this ping can return.
    if (!this.pingInProgress) {
      this.pingInProgress = true;
      this.pingLock = db.jobs.getNext();
      const nextJob: IJob|void = await this.pingLock;
      if (nextJob && nextJob.nextRunAt.getTime() > (Date.now() + oneDay)) {
        // If the next job is over a day ahead, reschedule ping (timeout can overflow)
        clearTimeout(this.currentTimeout!);
        this.currentTimeout = setTimeout(() => this.ping(),
          Date.now() + oneDay);
      } else if (nextJob && (!this.nextRun || nextJob.nextRunAt < this.nextRun)) {
        clearTimeout(this.currentTimeout!);
        this.nextRun = nextJob.nextRunAt;
        this.currentTimeout = setTimeout(() => this.runJob(nextJob),
          this.nextRun.getTime() - Date.now());
      }
      this.pingInProgress = false;
    }
  }

  private async runJob(job: IJob) {
    log.debug(`Running ${job.type} job ${job.videoId}`);
    await db.jobs.markRunning(job.id);
    this.nextRun = null;
    this.currentTimeout = null;
    this.doRunJob(job)
      .catch(err => {
        log.error(`Failed to run ${job.type} job ${job.videoId}: ${err}`);
      });
    this.start();
  }

  private async doRunJob(job: IJob): Promise<void> {
    if (!await db.jobs.getOne(job.id)) {
      // Check if the job was since removed
      return;
    }
    if (!await db.videos.getOne(job.videoId)) {
      // Check if the video was since removed
      log.debug(`Aborting ${job.type} job ${job.videoId} run since video was removed`);
      await this.removeJobs(job.videoId);
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
        await this.tryReschedule(job);
        this.start();
      } else {
        await db.jobs.markDone(job.id);
      }
    } catch (err) {
      log.error(`Error running ${job.type} job ${job.videoId}: ${err}`);
      await this.tryReschedule(job);
    }
  }

  private async tryReschedule(job: IJob): Promise<void> {
    try {
      await db.jobs.reschedule(job);
      this.start();
    } catch (err) {
      log.error(`Failed to reschedule ${job.type} job ${job.videoId}: ${err}`);
    }
  }
}
