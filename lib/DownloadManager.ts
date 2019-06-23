import * as fs from 'fs';
import * as Client from 'ftp';
import * as path from 'path';
import * as rmfr from 'rmfr';
import {promisify} from 'util';
import {DBManager} from './DBManager';
import {getDescription, getFileSafeTitle, Video, VideoMeta} from './media';
import {getPopularReleasedBetween} from './request';
import {settings} from './settings';
import {logDebug, logSubProcess, logSubProcessError} from './terminal';
import {assignMeta, DownloadClient, DownloadProgress, getBestTorrent, SearchClient} from './torrent';
import {delay, getMorning, getMsUntil, getMsUntilWeekday} from './util';
const access = promisify(fs.access);
const mkdir = promisify(fs.mkdir);

const DOWNLOAD_ROOT = process.env.DOWNLOAD_ROOT || path.resolve(__dirname, '../downloads');
const EXPORT_ROOT = process.env.EXPORT_ROOT || path.resolve(__dirname, '../media');
const USE_FTP = Boolean(parseInt(process.env.USE_FTP || "0", 10));

export class DownloadManager {
  private _downloadClient: DownloadClient;
  private _downloading: VideoMeta[] = [];
  private _managingPromise: Promise<void>;
  private _inProgress: boolean = false;

  constructor(private _dbManager: DBManager, private _searchClient: SearchClient) {
    this._downloadClient = new DownloadClient();
    this._startRemovingFailed().catch(err => {
      logSubProcessError(`DownloadManager _startRemovingFailed first call failed: ${err}`);
    });
    this._startAddingUpcomingToMonitored().catch(err => {
      logSubProcessError(`DownloadManager _startAddingUpcomingToMonitored first call failed: ${err}`);
    });
    this.ping();
  }

  // A non-async public wrapper is used to prevent accidental waiting on the ping function.
  public ping(): void {
    this._ping().catch(err => {
      logSubProcessError(`DownloadManager _ping failed with error: ${err}`);
    });
  }

  public async pingAndWait(): Promise<void> {
    await this._ping();
  }

  public getProgress(video: VideoMeta): DownloadProgress {
    return this._downloadClient.getProgress(video.magnet || '');
  }

  // This function should NOT be awaited.
  private async _ping(): Promise<void> {
    logDebug(`DownloadManager: _ping()`);
    await this._managingPromise;
    // If after waiting, the downloads are already being managed again, the goal of the ping
    // is already being accomplished, so this ping can return.
    if (!this._inProgress) {
      this._inProgress = true;
      this._managingPromise = this._manageDownloads();
      await this._managingPromise;
      this._inProgress = false;
    }
  }

  private async _manageDownloads(): Promise<void> {
    logDebug(`DownloadManager: _manageDownloads()`);
    // Should be pinged when:
    // - An item is added/removed/reordered in the queue.
    // - An item finishes downloading.
    try {
      // Manage which videos are downloading in the queue.
      const downloads = await this._dbManager.manageDownloads();

      // Determine which downloads to start and stop.
      const start = downloads.filter(v => !this._downloading.find(_v => _v.id === v.id));
      const stop = this._downloading.filter(v => !downloads.find(_v => _v.id === v.id));
      logDebug(`DownloadManager: _manageDownloads() starting ${start.length}`);
      logDebug(`DownloadManager: _manageDownloads() stopping ${stop.length}`);

      // Use the results from the database query to start/stop downloads.
      start.forEach(v => this._startDownload(v));
      stop.forEach(v => this._stopDownload(v));

      // Update downloading array.
      this._downloading = downloads;
    } catch (err) {
      logSubProcessError(`_manageDownloads err: ${err}`);
    }
  }

  private async _startRemovingFailed(): Promise<void> {
    logSubProcess(`Download Manager cleanup process started`);
    try {
      while (true) {
        await this._removeFailed();
        // Wait until the daily time given in settings to remove failed items.
        await delay(getMsUntil(settings.clearFailedAt));
      }
    } catch (err) {
      logSubProcessError(`Failed item removal process failed with error: ${err}`);
      setTimeout(() => {
        this._startRemovingFailed();
      }, 5000);
    }
  }

  private async _startAddingUpcomingToMonitored(): Promise<void> {
    logSubProcess(`Download Manager add upcoming process started`);
    try {
      while (true) {
        await this._addUpcomingToMonitored();
        // Wait until the daily time given in settings to remove failed items.
        await delay(getMsUntilWeekday(settings.addUpcomingWeekday, settings.monitorAt));
      }
    } catch (err) {
      logSubProcessError(`Add upcoming to monitored process failed with error: ${err}`);
      setTimeout(() => {
        this._startAddingUpcomingToMonitored();
      }, 5000);
    }
  }

  private async _addUpcomingToMonitored(): Promise<void> {
    logDebug(`DownloadManager: _addUpcomingToMonitored()`);
    const morn = getMorning();
    const twoWeeksAgoMs = morn.getTime() - (2 * 7 * 24 * 60 * 60 * 1000);
    const movies = await getPopularReleasedBetween(new Date(twoWeeksAgoMs), morn);
    // Add the movies to monitored predictively.
    const addActions = movies.map(m => this._dbManager.addToMonitored(m, -1, true));
    await Promise.all(addActions);
  }

  private async _removeFailed(): Promise<void> {
    logDebug(`DownloadManager: _removeFailed()`);
    const failedUpTimeMs = settings.failedUpTime * 60 * 60 * 1000;
    const cutoff = Date.now() - failedUpTimeMs;
    await this._dbManager.removeFailed(cutoff);
  }

  private async _startDownload(video: VideoMeta): Promise<void> {
    logDebug(`DownloadManager: _startDownload(${getDescription(video)})`);
    try {
      // Assign the torrent if it isn't already.
      if (!video.magnet) {
        const torrents = await this._searchClient.search(video);
        const videoMeta = await this._dbManager.addMetadata(video);
        const best = getBestTorrent(videoMeta, torrents);
        if (!best) {
          logDebug(`DownloadManager: _startDownload(${getDescription(video)}) failed (no torrent found)`);
          // If no good torrent was found, add the video to failed.
          await this._dbManager.markAsFailed(video);
          return;
        } else {
          logDebug(`DownloadManager: _startDownload(${getDescription(video)}) magnet added`);
          await this._dbManager.setTorrent(video.id, best);
          video = assignMeta(video, best);
        }
      }

      // Run the download
      const downloadPaths = await this._downloadClient.download(video.magnet!);

      // On completion, remove the item from the database.
      const removeFn = video.type === 'movie' ? (id: number) => this._dbManager.removeMovie(id) :
        (id: number) => this._dbManager.removeEpisodes([id]);
      await removeFn(video.id);

      // Remove from downloading
      this._downloading = this._downloading.filter(v => v.id !== video.id);

      // Export the video (run separately).
      exportVideo(video, downloadPaths).catch(err => {
        logSubProcessError(`Failed to export video files: ${err}`);
      });

      // Ping since the database changed.
      this.ping();
    } catch (err) {
      logSubProcessError(`_startDownload err: ${err}`);
      // When downloading fails, remove the magnet and mark the video as failed.
      await this._dbManager.markAsFailed(video);
    }
  }

  private async _stopDownload(video: VideoMeta): Promise<void> {
    try {
      if (video.magnet) {
        await this._downloadClient.stopDownload(video.magnet);
      }
    } catch (err) {
      logSubProcessError(`_stopDownload err: ${err}`);
    }
  }
}

// Save a video in the correct directory, adding any necessary directories.
async function exportVideo(video: Video, downloadPaths: string[]): Promise<void> {
  logDebug(`exportVideo(${getDescription(video)}, ${downloadPaths})`);
  const safeTitle = getFileSafeTitle(video);
  const dirs = video.type === 'movie' ? ['movies', safeTitle] :
    ['tv', safeTitle, `Season ${video.seasonNum}`];

  let exportPath = EXPORT_ROOT;
  if (!USE_FTP) { logDebug(`exportVideo: Creating missing folders in export directory`); }
  for (const pathElem of dirs) {
    exportPath = path.join(exportPath, pathElem);
    if (!USE_FTP) {
      // The FTP copy process creates any folders needed in the FTP directory, but the
      // normal copy process does not.
      try {
        await access(exportPath, fs.constants.F_OK);
      } catch {
        // Throws when path does not exist
        await mkdir(exportPath);
      }
    }
  }

  // Move the files to the final directory.
  logDebug(`exportVideo: Copying videos to ${USE_FTP ? 'FTP server at ' : ''}${exportPath}`);
  const copyActions = downloadPaths.map(downloadPath => {
    const from = path.join(DOWNLOAD_ROOT, downloadPath);
    const to = path.join(exportPath, path.basename(downloadPath));
    return USE_FTP ? ftpCopy(from, to) : copy(from, to);
  });
  await Promise.all(copyActions);

  // Remove the download directories (Remove the first directory of each downloaded file).
  logDebug(`exportVideo: Removing download directory`);
  const deleteActions = downloadPaths.map(downloadPath => {
    const abs = path.join(DOWNLOAD_ROOT, path.dirname(downloadPath));
    return rmfr(abs);
  });
  await Promise.all(deleteActions);
}

function ftpCopy(src: string, dst: string): Promise<void> {
  const c = new Client();
  const directory = path.dirname(dst);
  return new Promise((resolve, reject) => {
    c.on('ready', async () => {
      // Make the necessary directories
      c.mkdir(directory, true, (_mkDirErr: Error|undefined) => {
        // Suppress errors thrown because the directory already exists.
        if (_mkDirErr && !/already exists/.exec(_mkDirErr.message)) {
          reject(`FTP mkDir error: ` + _mkDirErr);
        }
        // Copy the file
        c.put(src, dst, (_putErr: Error) => {
          if (_putErr) { reject(`FTP put error: ` + _putErr); }
          c.end();
          resolve();
        });
      });
    });
    c.connect({
      host: process.env.FTP_HOST_IP,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS
    });
  });
}

function copy(src: string, dst: string): Promise<void> {
  return new Promise((resolve, reject) => {
    var rd = fs.createReadStream(src);
    rd.on("error", err => {
      reject(err);
    });
    var wr = fs.createWriteStream(dst);
    wr.on("error", err => {
      reject(err);
    });
    wr.on("close", () => {
      resolve();
    });
    rd.pipe(wr);
  });
}
