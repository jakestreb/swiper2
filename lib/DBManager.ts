import * as path from 'path';
import * as sqlite3 from 'sqlite3';

import {Media, Movie, Show} from './media';

interface AddOptions {
  monitor: boolean,
  queue: boolean,
  addedBy: number
};

interface SearchOptions {
  type?: 'movie'|'tv'|null
};

export interface ResultRow {
  [column: string]: any;
};

export class DBManager {
  private _db: sqlite3.Database;

  constructor() {
    const dbPath = process.env.DB_DIR || path.join(path.dirname(__dirname), 'memory.db');
    this._db = new sqlite3.Database(dbPath);
  }

  public async initDB(): Promise<void> {
    await this._run(`CREATE TABLE IF NOT EXISTS Movies (
      id INTEGER PRIMARY KEY,
      addedBy INTEGER,
      title TEXT,
      year TEXT,
      isMonitored INTEGER,
      isQueued INTEGER
    )`);
    await this._run(`CREATE TABLE IF NOT EXISTS Shows (
      id INTEGER PRIMARY KEY,
      addedBy INTEGER,
      title TEXT,
      isMonitored INTEGER,
      isQueued INTEGER
    )`);
    await this._run(`CREATE TABLE IF NOT EXISTS Episodes (
      id INTEGER PRIMARY KEY,
      addedBy INTEGER,
      seasonNum INTEGER,
      episodeNum INTEGER,
      airDate TEXT,
      show INTEGER
    )`);
  };

  public async add(media: Media, options: AddOptions): Promise<void> {
    if (media.type === 'movie') {
      await this._addMovie(media as Movie, options);
    } else if (media.type === 'tv') {
      await this._addShow(media as Show, options);
    } else {
      throw new Error(`Cannot add item ${media.toString()} to the database`);
    }
  }

  // Searches movie and tv tables for titles that match the given input. If the type is
  // specified in the options, only that table is searched. Returns all matches as ResultRows.
  public async searchTitles(input: string, options: SearchOptions): Promise<ResultRow[]> {
    let rows = [];
    if (options.type !== 'tv') {
      // Search Movies
      rows.push(...await this._all(`SELECT * FROM Movies WHERE title LIKE ?`, [`%${input}%`]));
    }
    if (options.type !== 'movie') {
      // Search Shows
      rows.push(...await this._all(`SELECT * FROM Shows WHERE title LIKE ?`, [`%${input}%`]));
    }
    return rows;
  }

  private async _addMovie(movie: Movie, options: AddOptions): Promise<void> {
    await this._db.run(`INSERT INTO Movies (title, year, isMonitored, isQueued) VALUES (?, ?, ?, ?, ?)`,
      [options.addedBy, movie.title, movie.year, options.monitor, options.queue]);
  };

  private async _addShow(show: Show, options: AddOptions): Promise<void> {
    const showId = await this._run(
      `INSERT INTO Shows (title, isMonitored, isQueued) VALUES (?, ?, ?, ?, ?)`,
      [options.addedBy, show.title, options.monitor, options.queue]);
    for (const ep of show.episodes) {
      await this._run(`INSERT INTO Episodes (seasonNum, episodeNum, airDate, show) ` +
        `VALUES (?, ?, ?, ?)`,
        [ep.seasonNum, ep.episodeNum, ep.airDate ? ep.airDate.toISOString() : '', showId]);
    }
  };

  private async _removeMovie(id: number): Promise<void> {

  }

  private async _removeShow(id: number): Promise<void> {

  }

  private async _removeEpisodes(ids: number[]): Promise<void> {

  }

  private async _run(sql: string, params: any[] = []): Promise<number> {
    return new Promise((resolve, reject) => {
      this._db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  private async _all(sql: string, params: any[] = []): Promise<ResultRow[]> {
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
}
