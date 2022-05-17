import Base from './Base';

type JobInsertArg = JobDescription & {
  schedule: JobSchedule;
  initDelayS: number;
}

export default class Jobs extends Base<DBJob> {
  private static MAX_INTERVAL_SECONDS = 24 * 60 * 60;

  public async init(): Promise<this> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS jobs (
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

  public buildInstance(row: any): DBJob {
    return row;
  }

  public async getOne(id: number): Promise<DBJob|null> {
    return this.db.get('SELECT * FROM jobs WHERE id=? LIMIT 1', [id]);
  }

  public async getNextRun(videoId: number, type: JobType): Promise<Date|null> {
    const jobs: DBJob[] = await this.db.all('SELECT * FROM jobs WHERE videoId=?', [videoId]);
    const nextRuns = jobs
      .filter(job => job.type === type)
      .map(job => job.nextRunAt);
    return nextRuns.length > 0 ? new Date(Math.min(...nextRuns)) : null;
  }

  public getNext(): Promise<DBJob|null> {
    return this.db.get('SELECT * FROM jobs WHERE isDone=0 ORDER BY nextRunAt LIMIT 1');
  }

  // Note that this should only be called by the worker
  public async insert(arg: JobInsertArg): Promise<void> {
    console.warn('INSERT JOB', arg);
    await this.db.run(`INSERT INTO jobs `
      + `(type, videoId, schedule, intervalS, runCount, startAt, nextRunAt)`
    	+ ` VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [arg.type, arg.videoId, arg.schedule, arg.initDelayS, 0, arg.startAt, arg.startAt]);
  }

  public async reschedule(job: DBJob): Promise<void> {
    const { id, schedule, intervalS } = job;
    if (schedule === 'once') {
      return;
    }
    let interval = job.schedule === 'backoff' ? intervalS * 2 : intervalS;
    interval = Math.max(interval, Jobs.MAX_INTERVAL_SECONDS);

    const nextRunAt = new Date(Date.now() + interval * 1000);
    await this.db.run('UPDATE jobs SET nextRunAt=?, intervalS=?, isDone=0 WHERE id=?',
      [nextRunAt, interval, id]);
  }

  public async markDone(jobId: number): Promise<void> {
    await this.db.run('UPDATE jobs SET isDone=1, runCount=runCount+1 WHERE id=?', [jobId]);
  }

  public async deleteForVideo(videoId: number): Promise<void> {
    await this.db.run(`DELETE FROM jobs WHERE videoId=?`, videoId);
  }
}
