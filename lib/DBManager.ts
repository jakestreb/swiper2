import values = require('lodash/values');
import * as path from 'path';
import * as sqlite3 from 'sqlite3';

import {Episode, getDescription, Media, Movie, Show, sortEpisodes, Video} from './media';
import {settings} from './settings';
import {EpisodesDescriptor} from './Swiper';
import {logDebug} from './terminal';
import {getMorning} from './util';

interface AddOptions {
  queue: boolean;
  addedBy: number;
}

interface SearchOptions {
  type?: 'movie'|'tv'|null;
}

interface Status {
  monitored: Media[];
  queued: Media[];
  downloading: Video[];
  failed: Video[];
}

export interface ResultRow {
  [column: string]: any;
}

export class DBManager {
  private _db: sqlite3.Database;

  private _nextHigh: number = 1;
  private _nextLow: number = -1;

  constructor() {
    const dbPath = path.join(path.dirname(__dirname), process.env.DB_PATH || 'memory.db');
    this._db = new sqlite3.Database(dbPath);
  }


  // Only videos (not shows) can be queued. Everything that is not queued is monitored.
  // If a show contains any episodes that are not queued, its title with those episode nums
  // will show in the monitored list.
  public async initDB(): Promise<void> {
    logDebug(`DBManager: initDB()`);
    await this._run(`CREATE TABLE IF NOT EXISTS Movies (
      id INTEGER PRIMARY KEY ON CONFLICT REPLACE,
      addedBy INTEGER,
      type TEXT,
      title TEXT,
      year TEXT,
      release INTEGER,
      dvd INTEGER,
      magnet TEXT,
      queuePos INTEGER DEFAULT 0,
      isDownloading INTEGER DEFAULT 0,
      failedAt INTEGER DEFAULT 0
    )`);
    await this._run(`CREATE TABLE IF NOT EXISTS Shows (
      id INTEGER PRIMARY KEY ON CONFLICT REPLACE,
      addedBy INTEGER,
      type TEXT,
      title TEXT
    )`);
    // The episodeId column is uniquely named to avoid a duplicate name when joining with shows.
    await this._run(`CREATE TABLE IF NOT EXISTS Episodes (
      episodeId INTEGER PRIMARY KEY ON CONFLICT REPLACE,
      addedBy INTEGER,
      seasonNum INTEGER,
      episodeNum INTEGER,
      airDate INTEGER,
      show INTEGER,
      magnet TEXT,
      queuePos INTEGER DEFAULT 0,
      isDownloading INTEGER DEFAULT 0,
      failedAt INTEGER DEFAULT 0
    )`);
  }

  public async get(media: Media): Promise<ResultRow|void> {
    logDebug(`DBManager: get(${media.title})`);
    const table = media.type === 'movie' ? 'Movies' : 'Shows';
    return this._get(`SELECT * FROM ? WHERE id=?`, [table, media.id]);
  }

  public async getEpisode(episode: Episode): Promise<ResultRow|void> {
    logDebug(`DBManager: getEpisode(${getDescription(episode)})`);
    return this._get(`SELECT * FROM Episodes WHERE episodeId=?`, [episode.id]);
  }

  // Get all Movies and Shows. Note that a show can show up in both arrays with different
  // episodes in each.
  public async getStatus(): Promise<Status> {
    logDebug(`DBManager: getStatus()`);
    const movies = await this._all(`SELECT * FROM Movies`);
    const showEpisodes = await this._all(`SELECT * FROM Episodes LEFT JOIN Shows ` +
      `ON Episodes.show = Shows.id`);
    const all = movies.concat(showEpisodes);
    return {
      monitored: createMedia(all.filter(row => !row.queuePos && !row.failedAt)),
      queued: createMedia(all.filter(row => row.queuePos && !row.isDownloading)),
      downloading: createVideos(all.filter(row => row.isDownloading)),
      failed: createVideos(all.filter(row => row.failedAt)),
    };
  }

  public async getMonitored(): Promise<Media[]> {
    logDebug(`DBManager: getMonitored()`);
    const movies = await this._all(`SELECT * FROM Movies WHERE queuePos=0`);
    const showEpisodes = await this._all(`SELECT * FROM Episodes LEFT JOIN Shows ` +
      `ON Episodes.show = Shows.id WHERE queuePos=0 AND failedAt=0`);
    return createMedia(movies.concat(showEpisodes));
  }

  public async getMonitoredShows(): Promise<Show[]> {
    logDebug(`DBManager: getMonitoredShows()`);
    const showEpisodes = await this._all(`SELECT * FROM Episodes LEFT JOIN Shows ` +
      `ON Episodes.show = Shows.id WHERE queuePos=0 AND failedAt=0`);
    return createMedia(showEpisodes) as Show[];
  }

  // Adds the item if it is not already in the database and sets it to monitored.
  // Limited to media since only media should be added to
  public async addToMonitored(media: Media, addedBy: number): Promise<void> {
    logDebug(`DBManager: addToMonitored(${media.title}, ${addedBy})`);
    await this._add(media, {addedBy, queue: false});
  }

  // Adds the item if it is not already in the database and sets it to queued.
  public async addToQueued(media: Media, addedBy: number): Promise<void> {
    logDebug(`DBManager: addToQueued(${media.title}, ${addedBy})`);
    await this._add(media, {addedBy, queue: true});
  }

  public async moveToQueued(anyMedia: Movie|Show|Episode) {
    logDebug(`DBManager: moveToQueued(getDescription${anyMedia})`);
    if (anyMedia.type === 'movie') {
      const movie = anyMedia as Movie;
      await this._run(`UPDATE Movies SET queuePos=? WHERE id=?`, [this._nextLow--, movie.id]);
    } else if (anyMedia.type === 'tv') {
      const show = anyMedia as Show;
      const queuePos = this._nextLow--;
      for (const ep of show.episodes) {
        await this._run(`UPDATE Episodes SET queuePos=? WHERE show=?`, [queuePos, ep.show.id]);
      }
    } else if (anyMedia.type === 'episode') {
      const episode = anyMedia as Episode;
      await this._run(`UPDATE Episodes SET queuePos=? WHERE episodeId=?`, [this._nextLow--, episode.id]);
    } else {
      throw new Error(`Cannot move unknown item to queued`);
    }
  }

  public async markAsFailed(video: Video): Promise<void> {
    logDebug(`DBManager: markAsFailed(getDescription${video})`);
    const nowMs = Date.now();
    if (video.type === 'movie') {
      const movie = video as Movie;
      await this._run(`UPDATE Movies SET queuePos=0, isDownloading=0, failedAt=? WHERE id=?`,
        [nowMs, movie.id]);
    } else if (video.type === 'episode') {
      const episode = video as Episode;
      await this._run(`UPDATE Episodes SET queuePos=0, isDownloading=0, failedAt=? WHERE episodeId=?`,
        [nowMs, episode.id]);
    } else {
      throw new Error(`Cannot mark unknown item as failed`);
    }
  }

  // Remove all items that failed before the cutoff.
  public async removeFailed(cutoff: number): Promise<void> {
    logDebug(`DBManager: removeFailed(${cutoff})`);
    await this._run(`DELETE FROM Movies WHERE failedAt!=0 AND failedAt<?`, [cutoff]);
    await this._run(`DELETE FROM Episodes WHERE failedAt!=0 AND failedAt<?`, [cutoff]);
    // Remove show if all episodes were removed.
    await this._run(`DELETE FROM Shows WHERE id NOT IN (SELECT show FROM Episodes)`);
  }

  public async changeQueuePos(row: ResultRow, pos: 'first'|'last') {
    logDebug(`DBManager: changeQueuePos(${row.id}, ${pos})`);
    const newPos = pos === 'first' ? this._nextHigh++ : this._nextLow--;
    if (row.type === 'movie') {
      await this._run(`UPDATE Movies SET queuePos=? WHERE id=? AND queuePos!=0`, [newPos, row.id]);
    } else if (row.type === 'tv') {
      for (const ep of row.episodes) {
        await this._run(`UPDATE Episodes SET queuePos=? WHERE show=? AND queuePos!=0`, [newPos, ep.show.id]);
      }
    } else {
      throw new Error(`Cannot change unknown item position`);
    }
  }

  public async removeMovie(id: number): Promise<void> {
    logDebug(`DBManager: removeMovie(${id})`);
    await this._run(`DELETE FROM Movies WHERE id=?`, [id]);
  }

  public async removeEpisode(id: number): Promise<void> {
    logDebug(`DBManager: removeEpisode(${id})`);
    await this._run(`DELETE FROM Episodes WHERE episodeId=?`, [id]);
    // Remove show if all episodes were removed.
    await this._run(`DELETE FROM Shows WHERE id NOT IN (SELECT show FROM Episodes)`);
  }

  public async removeEpisodesByDescriptor(showId: number, episodes: EpisodesDescriptor): Promise<void> {
    logDebug(`DBManager: removeEpisodesByDescriptor(${showId}, ${JSON.stringify(episodes)})`);
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

  public async moveAllQueuedToFailed(addedBy: number): Promise<void> {
    logDebug(`DBManager: moveAllQueuedToFailed(${addedBy})`);
    const nowMs = Date.now();
    await this._run(`UPDATE Movies SET queuePos=0, isDownloading=0, failedAt=? WHERE ` +
      `queuePos!=0 AND addedBy=?`, [nowMs, addedBy]);
    await this._run(`UPDATE Episodes SET queuePos=0, isDownloading=0, failedAt=? WHERE ` +
      `queuePos!=0 AND addedBy=?`, [nowMs, addedBy]);
  }

  // Searches movie and tv tables for titles that match the given input. If the type is
  // specified in the options, only that table is searched. Returns all matches as ResultRows.
  public async searchTitles(input: string, options: SearchOptions): Promise<ResultRow[]> {
    logDebug(`DBManager: searchTitles(${input})`);
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

  // Updates the downloading items if the queue order or count has changed. After this function
  // is run, top n queued videos should be set to isDownloading. We don't use transactions
  // so the results just have to be consistent, if things change between fetches the process should
  // be pinged again to read just after. Returns all videos that are now set to download.
  public async manageDownloads(): Promise<Video[]> {
    logDebug(`DBManager: manageDownloads()`);
    // Get all queued movies and episodes.
    const movies = await this._all(`SELECT * FROM Movies WHERE queuePos!=0`);
    const episodes = await this._all(`SELECT * FROM Episodes LEFT JOIN Shows ON ` +
      `Episodes.show = Shows.id WHERE queuePos!=0`);

    // Combine and sort.
    const all = sortQueued(movies.concat(episodes));

    // Get top n.
    const top = all.slice(0, settings.maxDownloads);

    // Update the database.
    await this._updateDownloading(top);

    return createVideos(top);
  }

  public async addMagnet(video: Video, magnet: string): Promise<void> {
    logDebug(`DBManager: addMagnet(${getDescription(video)}, ${magnet})`);
    if (video.type === 'movie') {
      return this._run(`UPDATE Movies SET magnet=? WHERE id=?`, [magnet, video.id]);
    } else if (video.type === 'episode') {
      return this._run(`UPDATE Episodes SET magnet=? WHERE episodeId=?`, [magnet, video.id]);
    } else {
      throw new Error(`Cannot add magnet to unknown video`);
    }
  }

  // Result rows should be Movie or EpisodeShow rows. Sets isDownloading to true for the videos given by the rows
  // to downloading and sets all other downloading videos to not downloading.
  private async _updateDownloading(rows: ResultRow[]): Promise<void> {
    const movieIds = rows.filter(row => row.type === 'movie').map(row => row.id);
    const tasks = [];
    if (movieIds.length > 0) {
    tasks.push(this._run(`UPDATE Movies SET isDownloading = CASE WHEN id IN ` +
      `(${movieIds.map(m => '?')}) THEN 1 ELSE 0 END`, movieIds));
    }
    const episodeIds = rows.filter(row => row.type !== 'movie').map(row => row.episodeId);
    if (episodeIds.length > 0) {
      tasks.push(this._run(`UPDATE Episodes SET isDownloading = CASE WHEN episodeId IN ` +
        `(${episodeIds.map(e => '?')}) THEN 1 ELSE 0 END`, episodeIds));
    }
    await Promise.all(tasks);
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
    const queuePos = options.queue ? this._nextHigh++ : 0;
    await this._run(`INSERT INTO Movies (id, type, title, year, magnet, addedBy, queuePos) `
      + `VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [movie.id, movie.type, movie.title, movie.year, movie.magnet, options.addedBy, queuePos]);
  }

  private async _addShow(show: Show, options: AddOptions): Promise<void> {
    await this._run(
      `INSERT INTO Shows (id, type, title, addedBy) VALUES (?, ?, ?, ?)`,
      [show.id, show.type, show.title, options.addedBy]);
    const insertions: Array<Promise<void>> = [];
    const queuePos = options.queue ? this._nextHigh++ : 0;
    show.episodes.forEach(ep => {
      const airDate = ep.airDate ? ep.airDate.getTime() : 0;
      insertions.push(this._run(`INSERT INTO Episodes (episodeId, seasonNum, episodeNum, airDate, show, ` +
        `magnet, addedBy, queuePos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [ep.id, ep.seasonNum, ep.episodeNum, airDate, show.id, ep.magnet, options.addedBy, queuePos]));
    });
    await Promise.all(insertions);
  }

  private async _run(sql: string, params: any[] = []): Promise<void> {
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

// Each row should be from Movies or a join between Shows and Episodes.
function sortQueued(rows: ResultRow[]): ResultRow[] {
  // Sort by queuePos desc, then by season/episode asc, then title alphabetical.
  rows.sort((a, b) => {
    const queueComp = b.queuePos - a.queuePos;
    const seasonComp = (a.type === 'tv' && b.type === 'tv') ? (a.seasonNum - b.seasonNum) : 0;
    const episodeComp = (a.type === 'tv' && b.type === 'tv') ? (a.episodeNum - b.episodeNum) : 0;
    return queueComp || seasonComp || episodeComp;
  });
  return rows;
}

// Each row should be from Movies or a join between Shows and Episodes. Creates a sorted array
// of media items. All episodes of the same show should have the same queuePos.
function createMedia(rows: ResultRow[]): Media[] {
  // Sort by queuePos descending, or by title if the same.
  rows.sort((a, b) => (b.queuePos - a.queuePos) || (a.title > b.title ? 1 : -1));
  const media: Media[] = [];
  const showRefs: {[id: number]: Show} = {};
  rows.forEach(row => {
    if (row.type === 'movie') {
      media.push(_createMovie(row));
    } else if (row.type === 'tv') {
      if (!(row.id in showRefs)) {
        showRefs[row.id] = _createEmptyShow(row);
        media.push(showRefs[row.id]);
      }
      showRefs[row.id].episodes.push(_createEpisode(row, showRefs[row.id]));
    } else {
      throw new Error(`createMedia error: encountered unexpected row ${JSON.stringify(row)}`);
    }
  });
  const shows: Show[] = values(showRefs);
  // Sort show episodes by seasonNum/episodeNum to maintain invariant.
  shows.forEach(show => show.episodes = sortEpisodes(show.episodes));
  return media;
}

// Each row should be from Movies or a join between Shows and Episodes.
function createVideos(rows: ResultRow[]): Video[] {
  // Sort by queuePos descending, or by title if the same.
  rows.sort((a, b) => (b.queuePos - a.queuePos) || (a.title > b.title ? 1 : -1));
  const showRefs: {[id: number]: Show} = {};
  const videos: Video[] = rows.map(row => {
    if (row.type === 'movie') {
      return _createMovie(row);
    } else if (row.type === 'tv') {
      showRefs[row.id] = showRefs[row.id] || _createEmptyShow(row);
      const episode = _createEpisode(row, showRefs[row.id]);
      showRefs[row.id].episodes.push(episode);
      return episode;
    } else {
      throw new Error(`createMedia error: encountered unexpected row ${JSON.stringify(row)}`);
    }
  });
  const shows: Show[] = values(showRefs);
  // Sort show episodes by seasonNum/episodeNum to maintain invariant.
  shows.forEach(show => show.episodes = sortEpisodes(show.episodes));
  return videos;
}

// The row should be from Movies.
function _createMovie(row: ResultRow): Movie {
  return {
    id: row.id,
    type: 'movie',
    title: row.title,
    year: row.year,
    release: row.release ? new Date(row.release) : null,
    dvd: row.dvd ? new Date(row.dvd) : null,
    magnet: row.magnet || null
  };
}

// The row should be from a join between Shows and Episodes.
function _createEmptyShow(row: ResultRow): Show {
  return {
    id: row.id,
    type: 'tv',
    title: row.title,
    episodes: []
  };
}

// The row should be from a join between Shows and Episodes.
function _createEpisode(row: ResultRow, show: Show): Episode {
  return {
    show,
    id: row.episodeId,
    type: 'episode',
    seasonNum: row.seasonNum,
    episodeNum: row.episodeNum,
    airDate: row.airDate ? new Date(row.airDate) : null,
    magnet: row.magnet || null
  };
}
