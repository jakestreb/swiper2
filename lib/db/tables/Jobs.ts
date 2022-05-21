import Base from './Base';

type JobInsertArg = JobDescription & {
  schedule: JobSchedule;
  initDelayS: number;
}

interface JobDBRow {
  id: number;
  type: JobType;
  videoId: number;
  schedule: JobSchedule;
  intervalS: number;
  runCount: number;
  startAt: number;
  nextRunAt: number;
  isDone: boolean;
  createdAt: Date;
}

export default class Jobs extends Base<JobDBRow, IJob> {
  private static MAX_INTERVAL_SECONDS = 24 * 60 * 60;

  public async init(): Promise<this> {
    await this.run(`CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      type TEXT,
      videoId INTEGER,
      schedule TEXT,
      intervalS INTEGER,
      runCount INTEGER,
      startAt DATETIME,
      nextRunAt DATETIME,
      isDone INTEGER DEFAULT 0,
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

  public async getNextRun(videoId: number, type: JobType): Promise<Date|null> {
    const jobs: IJob[] = await this.all('SELECT * FROM jobs WHERE videoId=? AND isDone=0', [videoId]);
    const nextRuns = jobs
      .filter(job => job.type === type)
      .map(job => job.nextRunAt.getTime());
    return nextRuns.length > 0 ? new Date(Math.min(...nextRuns)) : null;
  }

  public getNext(avoid: number[] = []): Promise<IJob|void> {
    return this.get(`SELECT * FROM jobs WHERE isDone=0 AND `
      + `id NOT IN (${avoid.map(e => '?')}) ORDER BY nextRunAt LIMIT 1`, avoid);
  }

  // Note that this should only be called by the worker
  public async insert(arg: JobInsertArg): Promise<void> {
    await this.run(`INSERT INTO jobs `
      + `(type, videoId, schedule, intervalS, runCount, startAt, nextRunAt)`
    	+ ` VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [arg.type, arg.videoId, arg.schedule, arg.initDelayS, 0, arg.startAt, arg.startAt]);
  }

  public async reschedule(job: IJob): Promise<void> {
    const { id, schedule, intervalS } = job;
    if (schedule === 'once') {
      return;
    }
    let interval = job.schedule === 'backoff' ? intervalS * 2 : intervalS;
    interval = Math.max(interval, Jobs.MAX_INTERVAL_SECONDS);

    const nextRunAt = new Date(Date.now() + interval * 1000);
    await this.run('UPDATE jobs SET nextRunAt=?, intervalS=? WHERE id=?',
      [nextRunAt, interval, id]);
  }

  public async markDone(jobId: number): Promise<void> {
    await this.run('UPDATE jobs SET isDone=1, runCount=runCount+1 WHERE id=?', [jobId]);
  }

  public async deleteForVideo(videoId: number): Promise<void> {
    await this.run(`DELETE FROM jobs WHERE videoId=?`, [videoId]);
  }
}
