import Episodes from './tables/Episodes';
import Movies from './tables/Movies';
import Shows from './tables/Shows';
import Torrents from './tables/Torrents';
import Media from './helpers/Media';
import Videos from './helpers/Videos';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';

export class DBManager {

  public episodes: Episodes;
  public movies: Movies;
  public shows: Shows;
  public torrents: Torrents;

  public media: Media;
  public videos: Videos;

  private _db: sqlite3.Database;

  public async init(): Promise<void> {
    const dbPath = path.resolve(__dirname, './records.db');
    this._db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

    this.episodes = await new Episodes(this).init();
    this.movies = await new Movies(this).init();
    this.shows = await new Shows(this).init();
    this.torrents = await new Torrents(this).init();

    this.media = await new Media(this);
    this.videos = await new Videos(this);
  }

  public async all(sql: string, params: any[] = []): Promise<({ [column: string]: any })[]> {
    return new Promise((resolve, reject) => {
      this._db.all(sql, params, function(err, rows) {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  public async get(sql: string, params: any[] = []): Promise<{ [column: string]: any }|void> {
    const all = await this.all(sql, params);
    if (all.length > 0) {
      return all[0];
    }
  }

  public async run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
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

const db = new DBManager();

export default db;
