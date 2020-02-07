import * as settings from './_settings.json';
import * as log from './common/logger';
import {Episode, getDescription, Video} from './common/media';
import {delay, getDaysUntil, getMsUntil} from './common/util';
import {DBManager} from './DBManager';
import {DownloadManager} from './DownloadManager';
import {SearchClient} from './torrents/SearchClient';
import {getBestTorrent, Torrent} from './torrents/util';

interface CommandOptions {
  catchErrors?: boolean; // Default false
}

export class SwiperMonitor {
  constructor(
    private _dbManager: DBManager,
    private _searchClient: SearchClient,
    private _downloadManager: DownloadManager
  ) {
    this._startMonitoring().catch(() => { /* noop */ });
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
        log.subProcessError(`_doCheck error: ${err}`);
      } else {
        throw err;
      }
    }
  }

  private async _startMonitoring(): Promise<void> {
    this._doMonitor()
    .catch(err => {
      log.subProcessError(`Monitoring process failed with error: ${err}`);
      setTimeout(() => {
        this._startMonitoring().catch(() => { /* noop */ });
      }, 5000);
    });
  }

  /**
   * The monitoring process, which should be started and made to log and restart in case of errors.
   */
  private async _doMonitor(): Promise<void> {
    log.subProcess(`Monitoring started`);
    while (true) {

      // Episodes are released at predictable times, so their checks are individually scheduled.
      await this._scheduleEpisodeChecks();
      // Wait until the daily time given in settings to search for monitored items.
      await delay(getMsUntil(settings.monitorAtHour));
      await this.doCheck({catchErrors: true});
    }
  }

  // Perform an automated search for an item and download it if it's found. Give no prompts to the
  // user if the video is not found. Returns a boolean indicating success.
  private async _doSearch(video: Video, options: CommandOptions = {}): Promise<boolean> {
    log.subProcess(`Searching ${getDescription(video)}`);
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
        log.subProcess(`${getDescription(video)} not found`);
        return false;
      }
    } catch (err) {
      if (options.catchErrors) {
        log.subProcess(`_doSearch ${getDescription(video)} error: ${err}`);
      } else {
        throw err;
      }
      return false;
    }
  }

  private async _scheduleEpisodeChecks(): Promise<void> {
    const shows = await this._dbManager.getMonitoredShows();
    // Create one array of episodes with scheduled air dates only.
    const episodes = ([] as Episode[]).concat(...shows.map(s => s.episodes));
    episodes.forEach(ep => {
      this._doBackoffCheckEpisode(ep).catch(err => { /* noop */ });
    });
  }

  private async _doBackoffCheckEpisode(episode: Episode): Promise<void> {
    if (!episode.airDate) {
      return;
    }
    try {
      const backoff = settings.newEpisodeBackoffMins;
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
            this._doBackoffCheckEpisode(episode).catch(err => { /* noop */ });
          }
        });
      }
    } catch (err) {
      log.subProcessError(`_doBackoffCheckEpisode error: ${err}`);
    }
  }
}
