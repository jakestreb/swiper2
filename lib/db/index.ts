import Episodes from './tables/Episodes';
import Movies from './tables/Movies';
import Shows from './tables/Shows';
import Torrents from './tables/Torrents';
import Jobs from './tables/Jobs';
import Media from './helpers/Media';
import Videos from './helpers/Videos';
import * as log from '../util/log';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';

export class DBManager {

  public episodes: Episodes;
  public movies: Movies;
  public shows: Shows;
  public torrents: Torrents;
  public jobs: Jobs;

  public media: Media;
  public videos: Videos;

  private _db: sqlite3.Database;

  public async init(): Promise<void> {
    const dbPath = path.resolve(__dirname, '../../../records.db');
    this._db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

    this.episodes = await new Episodes(this).init();
    this.movies = await new Movies(this).init();
    this.shows = await new Shows(this).init();
    this.torrents = await new Torrents(this).init();
    this.jobs = await new Jobs(this).init(); // Note that jobs should only be added via worker

    this.media = await new Media(this);
    this.videos = await new Videos(this);
  }

  public async all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      log.debug(`${sql} (${params})`);
      this._db.all(sql, params, function(err, rows) {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  public async get(sql: string, params: any[] = []): Promise<any> {
    const all = await this.all(sql, params);
    if (all.length > 0) {
      return all[0];
    }
  }

  public async run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      log.debug(`${sql} (${params})`);
      this._db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

export default new DBManager();
