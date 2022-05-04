import Base from './Base';

export default class Jobs extends Base {
  private static MAX_INTERVAL_SECONDS = 24 * 60 * 60;

  public async init(): Promise<this> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      type TEXT,
      videoId INTEGER,
      schedule TEXT,
      intervalSeconds INTEGER,
      runCount INTEGER,
      runAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public getNext(): Promise<DBJob|null> {
    return this.db.get('SELECT * FROM jobs ORDER BY runAt LIMIT 1');
  }

  // Note that this should only be called by the worker
  public async insert(arg: JobDescription): Promise<void> {
    let interval = arg.intervalSeconds;
    // If running on backoff schedule, update interval by runCount
    interval = arg.schedule === 'backoff' ? interval * Math.pow(2, arg.runCount - 1) : interval;
    // If running more than once, the first execution should occur immediately
    interval = arg.schedule !== 'once' && arg.runCount === 0 ? 0 : interval;
    // Ensure interval does not exceed maximum
    interval = Math.max(interval, Jobs.MAX_INTERVAL_SECONDS);

    const runAt = new Date(Date.now() + interval * 1000);
    await this.db.run(`INSERT INTO jobs (type, videoId, schedule, intervalSeconds, runCount, runAt)`
    	+ ` VALUES (?, ?, ?, ?, ?, ?)`,
      [arg.type, arg.videoId, arg.schedule, arg.intervalSeconds, arg.runCount, runAt]);
  }

  public async deleteForVideo(videoId: number): Promise<void> {
    await this.db.run(`DELETE FROM jobs WHERE videoId=?)`, videoId);
  }
}
