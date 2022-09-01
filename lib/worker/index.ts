import db from '../db';
import * as log from '../log';
import BaseJob from './jobs/Base';
import * as jobs from './jobs';
import Swiper from '../Swiper';

const oneDay = 24 * 60 * 60 * 1000;

export default class Worker {
  private jobs: {[type: string]: typeof BaseJob} = jobs;
  private nextJobId: number = -1;
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
    log.info(`Adding ${job.type} job for video ${job.videoId}`);
    const JobClass = this.getJobClass(job.type);
    const { schedule, initDelayS } = JobClass;
    await db.jobs.insert({ ...job, schedule, initDelayS });
    this.start();
  }

  private getJobClass(type: JobType) {
    return this.jobs[type];
  }

  // Do not await
  private async ping() {
    log.info('Worker pinged');

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
      log.debug('Start handling ping');
      this.pingLock = db.jobs.getNext();
      const nextJob: IJob|void = await this.pingLock;
      log.debug(`Next job ${nextJob ? nextJob.id : 'null'}`);
      if (nextJob && nextJob.nextRunAt.getTime() > (Date.now() + oneDay)) {
        // If the next job is over a day ahead, reschedule ping (timeout can overflow)
        clearTimeout(this.currentTimeout!);
        this.currentTimeout = setTimeout(() => this.ping(), oneDay);
        log.debug('Waiting one day for another job to run');
      } else if (nextJob && nextJob.id !== this.nextJobId) {
        clearTimeout(this.currentTimeout!);
        this.nextJobId = nextJob.id;
        const waitTime = Math.max(nextJob.nextRunAt.getTime() - Date.now(), 0);
        this.currentTimeout = setTimeout(() => this.runJob(nextJob.id), waitTime);
        log.debug(`Waiting ${(waitTime / 1000).toFixed(1)}s to run job ${nextJob.id}`);
      }
      this.pingInProgress = false;
      log.debug('Done handling ping');
    }
  }

  private async runJob(jobId: number) {
    await db.jobs.markRunning(jobId);

    log.info(`Preparing to run job ${jobId}`);
    const job: IJob = (await db.jobs.getOne(jobId))!;
    if (job.status === 'done') {
      // Check if the job was since removed
      log.info(`Aborting job ${jobId} run since job was marked done`);
      return;
    }
    if (!await db.videos.getOne(job.videoId)) {
      // Check if the video was since removed
      log.info(`Aborting ${job.type} job ${jobId} run since video ${job.videoId} was removed`);
      await db.jobs.markDone(job.id);
      return;
    }
    this.nextJobId = -1;
    this.currentTimeout = null;
    this.doRunJob(job)
      .catch(err => {
        log.error(`Failed to run ${job.type} job ${jobId}: ${err}`);
      });
    this.start();
  }

  private async doRunJob(job: IJob): Promise<void> {
    const JobClass = this.getJobClass(job.type);
    const jobInst = new JobClass(this, this.swiper);
    let success = false;
    try {
      log.info(`Running ${job.type} job ${job.id}`);
      success = await jobInst.run(job.videoId, job.runCount);
      if (!success && JobClass.schedule !== 'once') {
        log.info(`Rescheduling ${job.type} job ${job.id}`);
        // Reschedule repeat jobs on failure
        await this.tryReschedule(job);
        this.start();
      } else {
        log.info(`Ran ${job.type} job ${job.id}`);
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
