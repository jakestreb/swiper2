import * as path from 'path';
import * as sqlite3 from 'sqlite3';

import {Media, Movie, Show, stringify} from './media';
import {EpisodesDescriptor} from './Swiper';
import {getMorning} from './util';

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

export type MediaResultRow = Media & { id: number };

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
      airDate INTEGER,
      show INTEGER
    )`);
  };

  public async add(media: Media, options: AddOptions): Promise<void> {
    if (media.type === 'movie') {
      await this._addMovie(media as Movie, options);
    } else if (media.type === 'tv') {
      await this._addShow(media as Show, options);
    } else {
      throw new Error(`Cannot add item ${stringify(media)} to the database`);
    }
  }

  // Given a row representing either a row in the Movies or Shows table, delete either the
  // movie or episodes of the given show. If all episodes of the show are removed, the show
  // is also removed.
  public async remove(row: MediaResultRow, episodes: EpisodesDescriptor = 'all'): Promise<void> {
    if (row.type === 'movie') {
      await this._removeMovie(row.id);
    } else if (row.type === 'tv') {
      await this._removeEpisodes(row.id, episodes);
    } else {
      throw new Error(`Cannot remove item ${stringify(row)} to the database`);
    }
  }

  public async removeAllQueued(): Promise<void> {
    await this._run(`DELETE FROM Movies WHERE isQueued=1`);
    await this._run(`DELETE FROM Shows WHERE isQueued=1`);
    await this._run(`DELETE FROM Episodes WHERE show NOT IN (SELECT id FROM Shows)`);
  }

  // Searches movie and tv tables for titles that match the given input. If the type is
  // specified in the options, only that table is searched. Returns all matches as ResultRows.
  public async searchTitles(input: string, options: SearchOptions): Promise<MediaResultRow[]> {
    let rows: MediaResultRow[] = [];
    if (options.type !== 'tv') {
      // Search Movies
      const results = await this._all(`SELECT * FROM Movies WHERE title LIKE ?`, [`%${input}%`]);
      rows.push(...results as MediaResultRow[]);
    }
    if (options.type !== 'movie') {
      // Search Shows
      const results = await this._all(`SELECT * FROM Shows WHERE title LIKE ?`, [`%${input}%`]);
      rows.push(...results as MediaResultRow[]);
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
        [ep.seasonNum, ep.episodeNum, ep.airDate ? ep.airDate.getTime() : 0, showId]);
    }
  };

  private async _removeMovie(id: number): Promise<void> {
    await this._run(`DELETE FROM Movies WHERE id=?`, [id]);
  }

  private async _removeEpisodes(showId: number, episodes: EpisodesDescriptor): Promise<void> {
    if (episodes === 'all') {
      await this._run(`DELETE FROM Episodes WHERE show=?`, [showId]);
    } else if (episodes === 'new') {
      await this._run(`DELETE FROM Episodes WHERE airDate>?`, [getMorning().getTime()]);
    } else {
      // Remove all episodes in the SeasonEpisode object.
      for (const seasonNumStr in episodes) {
        const seasonNum = parseInt(seasonNumStr, 10);
        const episodeNums = episodes[seasonNum];
        if (episodeNums === 'all') {
          await this._run(`DELETE FROM Episodes WHERE seasonNum=?`, [seasonNum]);
        } else {
          await this._run(`DELETE FROM Episodes WHERE seasonNum=? AND episodeNum IN ` +
            `(${episodeNums.map(e => '?')})`, [seasonNum, ...episodeNums]);
        }
      }
    }
    // Remove show if all episodes were removed.
    await this._run(`DELETE FROM Shows WHERE id NOT IN (SELECT show FROM Episodes)`);
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
