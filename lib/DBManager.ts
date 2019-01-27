import remove = require('lodash/remove');
import values = require('lodash/values');
import * as path from 'path';
import * as sqlite3 from 'sqlite3';

import {Episode, Media, Movie, Show, sortEpisodes} from './media';
import {EpisodesDescriptor} from './Swiper';
import {getMorning} from './util';

interface AddOptions {
  monitor: boolean;
  queue: boolean;
  addedBy: number;
}

interface SearchOptions {
  type?: 'movie'|'tv'|null;
}

interface Status {
  monitored: Media[];
  queued: Media[];
}

export interface ResultRow {
  [column: string]: any;
}

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
      type TEXT,
      title TEXT,
      year TEXT,
      release INTEGER,
      dvd INTEGER,
      isMonitored INTEGER,
      isQueued INTEGER
    )`);
    await this._run(`CREATE TABLE IF NOT EXISTS Shows (
      id INTEGER PRIMARY KEY,
      addedBy INTEGER,
      type TEXT,
      title TEXT,
      isMonitored INTEGER,
      isQueued INTEGER
    )`);
    // The episodeId column is uniquely named to avoid a duplicate name when joining with shows.
    await this._run(`CREATE TABLE IF NOT EXISTS Episodes (
      episodeId INTEGER PRIMARY KEY,
      addedBy INTEGER,
      seasonNum INTEGER,
      episodeNum INTEGER,
      airDate INTEGER,
      show INTEGER
    )`);
  }

  public async get(media: Media): Promise<ResultRow|void> {
    const table = media.type === 'movie' ? 'Movies' : 'Shows';
    return this._get(`SELECT * FROM ? WHERE id=?`, [table, media.id]);
  }

  public async getEpisode(episode: Episode): Promise<ResultRow|void> {
    return this._get(`SELECT * FROM Episodes WHERE episodeId=?`, [episode.id]);
  }

  // Get all Movies and Shows
  public async getAll(): Promise<Status> {
    const movies = await this._all(`SELECT * FROM Movies`);
    const showEpisodes = await this._all(`SELECT * FROM Shows LEFT JOIN Episodes ` +
      `ON Shows.id = Episodes.show`);
    const queuedMovies = remove(movies, (m: ResultRow) => m.isQueued);
    const queuedShows = remove(showEpisodes, (s: ResultRow) => s.isQueued);
    return {
      queued: [...createMovies(queuedMovies), ...createShows(queuedShows)],
      monitored: [...createMovies(movies), ...createShows(showEpisodes)]
    };
  }

  public async getMonitored(): Promise<Media[]> {
    return this._getMonitored();
  }

  public async getMonitoredShows(): Promise<Show[]> {
    return this._getMonitored(true) as Promise<Show[]>;
  }

  // Adds the item if it is not already in the database and sets it to monitored.
  public async addToMonitored(media: Media, addedBy: number): Promise<void> {
    await this._add(media, {addedBy, monitor: true, queue: false});
  }

  // Adds the item if it is not already in the database and sets it to queued.
  public async addToQueued(media: Media, addedBy: number): Promise<void> {
    await this._add(media, {addedBy, monitor: false, queue: true});
  }

  // Given a row representing either a row in the Movies or Shows table, delete either the
  // movie or episodes of the given show. If all episodes of the show are removed, the show
  // is also removed.
  public async remove(row: ResultRow, episodes: EpisodesDescriptor = 'all'): Promise<void> {
    if (row.type === 'movie') {
      await this._removeMovie(row.id);
    } else if (row.type === 'tv') {
      await this._removeEpisodes(row.id, episodes);
    } else {
      throw new Error(`Cannot remove item ${row.title} from the database`);
    }
  }

  public async removeAllQueued(): Promise<void> {
    await this._run(`DELETE FROM Movies WHERE isQueued=1`);
    await this._run(`DELETE FROM Shows WHERE isQueued=1`);
    await this._run(`DELETE FROM Episodes WHERE show NOT IN (SELECT id FROM Shows)`);
  }

  // Searches movie and tv tables for titles that match the given input. If the type is
  // specified in the options, only that table is searched. Returns all matches as ResultRows.
  public async searchTitles(input: string, options: SearchOptions): Promise<ResultRow[]> {
    const rows: ResultRow[] = [];
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

  private async _getMonitored(tvOnly: boolean = false): Promise<Media[]> {
    let movies: Movie[] = [];
    if (!tvOnly) {
      const movieRows = await this._all(`SELECT * FROM Movies WHERE isMonitored = 1`);
      movies = createMovies(movieRows);
    }
    const showEpisodes = await this._all(`SELECT * FROM Shows LEFT JOIN Episodes ` +
      `ON Shows.id = Episodes.show WHERE isMonitored = 1`);
    return [...movies, ...createShows(showEpisodes)];
  }

  private async _add(media: Media, options: AddOptions): Promise<void> {
    if (media.type === 'movie') {
      await this._addMovie(media as Movie, options);
    } else if (media.type === 'tv') {
      await this._addShow(media as Show, options);
    } else {
      throw new Error(`Cannot add unknown item to the database`);
    }
  }

  private async _addMovie(movie: Movie, options: AddOptions): Promise<void> {
    await this._db.run(`INSERT OR REPLACE INTO Movies (addedBy, type, title, year, isMonitored, isQueued) `
      + `VALUES (?, ?, ?, ?, ?, ?)`,
      [options.addedBy, movie.type, movie.title, movie.year, options.monitor, options.queue]);
  }

  private async _addShow(show: Show, options: AddOptions): Promise<void> {
    const showId = await this._run(
      `INSERT OR REPLACE INTO Shows (addedBy, type, title, isMonitored, isQueued) VALUES (?, ?, ?, ?, ?)`,
      [options.addedBy, show.type, show.title, options.monitor, options.queue]);
    for (const ep of show.episodes) {
      await this._run(`INSERT OR REPLACE INTO Episodes (seasonNum, episodeNum, airDate, show) ` +
        `VALUES (?, ?, ?, ?)`,
        [ep.seasonNum, ep.episodeNum, ep.airDate ? ep.airDate.getTime() : 0, showId]);
    }
  }

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
      const removals: Array<Promise<any>> = [];
      Object.keys(episodes).forEach(seasonNumStr => {
        const seasonNum = parseInt(seasonNumStr, 10);
        const episodeNums = episodes[seasonNum];
        if (episodeNums === 'all') {
          removals.push(this._run(`DELETE FROM Episodes WHERE seasonNum=?`, [seasonNum]));
        } else {
          removals.push(this._run(`DELETE FROM Episodes WHERE seasonNum=? AND episodeNum IN ` +
            `(${episodeNums.map(e => '?')})`, [seasonNum, ...episodeNums]));
        }
      });
      await Promise.all(removals);
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

  private async _get(sql: string, params: any[] = []): Promise<ResultRow|void> {
    const all = await this._all(sql, params);
    if (all.length > 0) {
      return all[0];
    }
  }
}

function createMovies(rows: ResultRow[]): Movie[] {
  return rows.map(row => ({
    id: row.id,
    type: 'movie',
    title: row.title,
    year: row.year,
    release: row.release ? new Date(row.release) : null,
    dvd: row.dvd ? new Date(row.dvd) : null
  } as Movie));
}

// Each row should be from a join between the Shows and Episodes table.
function createShows(rows: ResultRow[]): Show[] {
  const showMap: {[id: number]: Show} = {};
  rows.forEach(row => {
    showMap[row.id] = showMap[row.id] || {
      id: row.id,
      type: 'tv',
      title: row.title,
      episodes: []
    } as Show;
    showMap[row.id].episodes.push({
      id: row.episodeId,
      show: showMap[row.id],
      type: 'episode',
      seasonNum: row.seasonNum,
      episodeNum: row.episodeNum,
      airDate: row.airDate ? new Date(row.airDate) : null
    } as Episode);
  });
  const shows: Show[] = values(showMap);
  shows.forEach(show => show.episodes = sortEpisodes(show.episodes));
  return shows;
}
