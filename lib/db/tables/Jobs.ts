import Base from './Base';

type JobInsertArg = JobDescription & {
  schedule: JobSchedule;
  initDelayS: number;
}

interface JobDBRow {
  id: number;
  type: JobType;
  status: JobStatus;
  videoId: number;
  schedule: JobSchedule;
  intervalS: number;
  runCount: number;
  startAt: number;
  nextRunAt: number;
  createdAt: Date;
}

export default class Jobs extends Base<JobDBRow, IJob> {
  private static MAX_INTERVAL_SECONDS = 24 * 60 * 60;

  public async init(): Promise<this> {
    await this.run(`CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      type TEXT,
      status TEXT,
      videoId INTEGER,
      schedule TEXT,
      intervalS INTEGER,
      runCount INTEGER,
      startAt DATETIME,
      nextRunAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public buildInstance(row: JobDBRow): IJob {
    const startAt = new Date(row.startAt);
    const nextRunAt = new Date(row.nextRunAt);
    return { ...row, startAt, nextRunAt };
  }

  public async getOne(id: number): Promise<IJob|void> {
    return this.get('SELECT * FROM jobs WHERE id=? LIMIT 1', [id]);
  }

  public async getNextRun(videoId: number, types: JobType[]): Promise<Date|null> {
    const job: IJob|void = await this.get(
      `SELECT * FROM jobs WHERE videoId=? AND status!='done' `
      + `AND type IN (${types.map(t => '?')}) ORDER BY nextRunAt LIMIT 1`, [videoId, ...types]
    );
    return job ? new Date(job.nextRunAt.getTime()) : null;
  }

  public getNext(): Promise<IJob|void> {
    return this.get(`SELECT * FROM jobs WHERE status='pending' ORDER BY nextRunAt LIMIT 1`);
  }

  // Note that this should only be called by the worker
  public async insert(arg: JobInsertArg): Promise<void> {
    await this.run(`INSERT INTO jobs `
      + `(status, runCount, type, videoId, schedule, intervalS, startAt, nextRunAt)`
    	+ ` VALUES ('pending', 0, ?, ?, ?, ?, ?, ?)`,
      [arg.type, arg.videoId, arg.schedule, arg.initDelayS, arg.startAt, arg.startAt]);
  }

  public async reschedule(job: IJob): Promise<void> {
    const { id, schedule, intervalS } = job;
    if (schedule === 'once') {
      return;
    }
    let interval = job.schedule === 'backoff' ? intervalS * 2 : intervalS;
    interval = Math.min(interval, Jobs.MAX_INTERVAL_SECONDS);

    const nextRunAt = new Date(Date.now() + interval * 1000);
    await this.run('UPDATE jobs SET nextRunAt=?, intervalS=?, status=\'pending\' WHERE id=?',
      [nextRunAt, interval, id]);
  }

  public async markRunning(jobId: number): Promise<void> {
    await this.run('UPDATE jobs SET status=\'running\', runCount=runCount+1 WHERE id=?', [jobId]);
  }

  public async markDone(jobId: number): Promise<void> {
    await this.run('UPDATE jobs SET status=\'done\' WHERE id=?', [jobId]);
  }

  public async markRunningAsPending(): Promise<void> {
    await this.run('UPDATE jobs SET status=\'pending\' WHERE status=\'running\'');
  }
}
