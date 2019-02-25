import sum = require('lodash/sum');
import {DBManager} from './DBManager';
import {DownloadManager} from './DownloadManager';
import {Episode, getDescription, Video} from './media';
import {settings} from './settings';
import {logSubProcess, logSubProcessError} from './terminal';
import {getBestTorrent, SearchClient, Torrent} from './torrent';
import {delay, getDaysUntil, getMorning, getMsUntil} from './util';

interface CommandOptions {
  catchErrors?: boolean; // Default false
}

export class SwiperMonitor {
  constructor(
    private _dbManager: DBManager,
    private _searchClient: SearchClient,
    private _downloadManager: DownloadManager
  ) {
    this._startMonitoring();
  }

  // Perform automated searched for all released monitored items.
  public async doCheck(options: CommandOptions = {}): Promise<void> {
    try {
      const now = new Date();
      const monitored = await this._dbManager.getMonitored();
      const videos = ([] as Video[]).concat(...monitored.map(media =>
        media.type === 'movie' ? [media] : media.episodes
      ));
      // Decide which media items should be searched.
      const released = videos.filter(vid => {
        if (vid.type === 'movie') {
          const daysUntilDVD = vid.dvd ? getDaysUntil(vid.dvd) : 0;
          return daysUntilDVD <= settings.daysBeforeDVD;
        } else {
          return vid.airDate && now > vid.airDate;
        }
      });
      const searches = released.map(vid => this._doSearch(vid, options));
      await Promise.all(searches);
    } catch (err) {
      if (options.catchErrors) {
        logSubProcessError(`_doCheck error: ${err}`);
      } else {
        throw err;
      }
    }
  }

  // Downloads the number of random movies given by count. Picks new random movies for any
  // that fail. Retries with a set of new movies up to 10 times.
  public async downloadRandomMovie(count: number = 1, retries: number = 0): Promise<void> {
    const movies = await this._dbManager.getMoviePicks(count);
    const addActions = movies.map(m => this._dbManager.addToQueued(m, -1));
    await Promise.all(addActions);
    const searches = movies.map(async m => {
      // Perform the search, and move the movie to failed if it doesnt work.
      const success = await this._doSearch(m, {catchErrors: true});
      if (!success) { await this._dbManager.markAsFailed(m); }
      return success;
    });
    const results = await Promise.all(searches);
    const numFailed = results.length - sum(results);
    if (numFailed > 0 && retries < 10) {
      await this.downloadRandomMovie(numFailed, retries + 1);
    }
  }

  private async _startMonitoring(): Promise<void> {
    this._doMonitor()
    .catch(err => {
      logSubProcessError(`Monitoring process failed with error: ${err}`);
      setTimeout(() => {
        this._startMonitoring();
      }, 5000);
    });
  }

  /**
   * The monitoring process, which should be started and made to log and restart in case of errors.
   */
  private async _doMonitor(): Promise<void> {
    logSubProcess(`Monitoring started`);
    while (true) {

      // Episodes are released at predictable times, so their checks are individually scheduled.
      await this._scheduleEpisodeChecks();
      // Wait until the daily time given in settings to search for monitored items.
      await delay(getMsUntil(settings.monitorAt));
      await this.doCheck({catchErrors: true});
      await this._downloadRandomMovies();
    }
  }

  // Perform an automated search for an item and download it if it's found. Give no prompts to the
  // user if the video is not found. Returns a boolean indicating success.
  private async _doSearch(video: Video, options: CommandOptions = {}): Promise<boolean> {
    logSubProcess(`Searching ${getDescription(video)}`);
    try {
      const torrents: Torrent[] = await this._searchClient.search(video);
      const videoMeta = await this._dbManager.addMetadata(video);
      const bestTorrent = getBestTorrent(videoMeta, torrents);
      if (bestTorrent !== null) {
        // Set the item in the database to queued.
        await this._dbManager.setTorrent(video.id, bestTorrent);
        await this._dbManager.moveToQueued(video);
        this._downloadManager.ping();
        return true;
      } else {
        logSubProcess(`${getDescription(video)} not found`);
        return false;
      }
    } catch (err) {
      if (options.catchErrors) {
        logSubProcess(`_doSearch ${getDescription(video)} error: ${err}`);
      } else {
        throw err;
      }
      return false;
    }
  }

  private async _downloadRandomMovies(): Promise<void> {
    const day = getMorning().getDay();
    const count = settings.weeklyRandomMovies[day];
    await this.downloadRandomMovie(count);
  }

  private async _scheduleEpisodeChecks(): Promise<void> {
    const shows = await this._dbManager.getMonitoredShows();
    // Create one array of episodes with scheduled air dates only.
    const episodes = ([] as Episode[]).concat(...shows.map(s => s.episodes));
    episodes.forEach(ep => { this._doBackoffCheckEpisode(ep); });
  }

  private async _doBackoffCheckEpisode(episode: Episode): Promise<void> {
    if (!episode.airDate) {
      return;
    }
    const backoff = settings.newEpisodeBackoff;
    const now = new Date();
    // Difference in ms between now and the release date.
    const msPast = now.valueOf() - episode.airDate.valueOf();
    let acc = 0;
    for (let i = 0; msPast > acc && i < backoff.length; i++) {
      acc += backoff[i] * 60 * 1000;
    }
    if (msPast > acc) {
      // Repeat search array has ended.
      return;
    }
    // Delay until the next check time.
    await delay(acc - msPast);
    // If the episode is still in the monitored array, look for it and repeat on failure.
    try {
      const copy = await this._dbManager.getEpisode(episode);
      if (copy && copy.isMonitored) {
        setImmediate(async () => {
          const beforeTime = Date.now();
          const success = await this._doSearch(episode, {catchErrors: true});
          if (!success) {
            // After failing, always delay 1 minute before re-scheduling to prevent an endless loop.
            // Subtract time already spent searching this time.
            const waitTime = (60 * 1000) - (Date.now() - beforeTime);
            await delay(waitTime);
            this._doBackoffCheckEpisode(episode);
          }
        });
      }
    } catch (err) {
      logSubProcessError(`_doBackoffCheckEpisode error: ${err}`);
    }
  }
}
