import * as fs from 'fs';
import * as path from 'path';
import * as rmfr from 'rmfr';
import {promisify} from 'util';
import {DBManager} from './DBManager';
import {getDescription, getFileSafeTitle, Video} from './media';
import {settings} from './settings';
import {logDebug, logSubProcess, logSubProcessError} from './terminal';
import {DownloadProgress, getBestTorrent, TorrentClient} from './torrent';
import {delay, getMsUntil} from './util';
const access = promisify(fs.access);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);

const root = path.dirname(__dirname);
const EXPORT_ROOT = path.join(root, process.env.EXPORT_ROOT || 'media');;

export class DownloadManager {
  private _downloading: Video[] = [];
  private _pinged: boolean = false;
  private _inProgress: boolean = false;

  constructor(private _dbManager: DBManager, private _torrentClient: TorrentClient) {
    this._startRemovingFailed();
    this.ping();
  }

  // A non-async public wrapper is used to prevent waiting on the ping function.
  public ping(): void { this._ping(); }

  public getProgress(video: Video): DownloadProgress {
    return this._torrentClient.getProgress(video.magnet || '');
  }

  // This function should NOT be awaited.
  private async _ping(): Promise<void> {
    logDebug(`DownloadManager: _ping()`);
    this._pinged = true;
    if (!this._inProgress) {
      this._inProgress = true;
      while (this._pinged) {
        this._pinged = false;
        await this._manageDownloads();
      }
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
    logSubProcess(`Download Manager started`);
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

  private async _removeFailed(): Promise<void> {
    logDebug(`DownloadManager: _removeFailed()`);
    const failedUpTimeMs = settings.failedUpTime * 60 * 60 * 1000;
    const cutoff = Date.now() - failedUpTimeMs;
    await this._dbManager.removeFailed(cutoff);
  }

  private async _startDownload(video: Video): Promise<void> {
    logDebug(`DownloadManager: _startDownload(${getDescription(video)})`);
    try {
      // Assign the torrent if it isn't already.
      if (!video.magnet) {
        const torrents = await this._torrentClient.search(video);
        const best = getBestTorrent(video, torrents);
        if (!best) {
          logDebug(`DownloadManager: _startDownload(${getDescription(video)}) failed (no torrent found)`);
          // If no good torrent was found, add the video to failed.
          await this._dbManager.markAsFailed(video);
          return;
        } else {
          logDebug(`DownloadManager: _startDownload(${getDescription(video)}) magnet added`);
          video.magnet = best.magnet;
          await this._dbManager.addMagnet(video, best.magnet);
        }
      }

      // Run the download
      const downloadDir = await this._torrentClient.download(video.magnet);

      // On completion, remove the item from the database.
      const removeFn = video.type === 'movie' ? this._dbManager.removeMovie :
        this._dbManager.removeEpisode;
      await removeFn(video.id);

      // Remove from downloading
      this._downloading = this._downloading.filter(v => v.id !== video.id);

      // Export the video (run separately).
      exportVideo(video, downloadDir);

      // Ping since the database changed.
      this.ping();
    } catch (err) {
      logSubProcessError(`_startDownload err: ${err}`);
      // When downloading fails, remove the magnet and mark the video as failed.
      video.magnet = null;
      await this._dbManager.markAsFailed(video);
    }
  }

  private async _stopDownload(video: Video): Promise<void> {
    try {
      if (video.magnet) {
        await this._torrentClient.stopDownload(video.magnet);
      }
    } catch (err) {
      logSubProcessError(`_stopDownload err: ${err}`);
    }
  }
}

// Save a video in the correct directory, adding any necessary directories.
async function exportVideo(video: Video, downloadDir: string): Promise<void> {
  const safeTitle = getFileSafeTitle(video);
  const dirs = video.type === 'movie' ? ['movies', safeTitle] :
    ['tv', safeTitle, `Season ${video.seasonNum}`];

  try {
    // Create any directories needed to store the video file.
    let filepath = EXPORT_ROOT;
    for (let i = 0; i < dirs.length; i++) {
      filepath = path.join(filepath, dirs[i]);
      try {
        await access(filepath, fs.constants.F_OK);
      } catch {
        // Throws when path does not exist
        await mkdir(filepath);
      }
    }

    // Get the names of all the downloaded files.
    const downloadFileNames = await readdir(downloadDir);

    // Move the files to the final directory.
    const copyActions = downloadFileNames.map(filename =>
      copy(path.join(downloadDir, filename), path.join(filepath, filename)));
    await Promise.all(copyActions);

    // Remove the download directory.
    await rmfr(downloadDir);
  } catch (err) {
    logSubProcessError(`Failed to export video files: ${err}`);
  }
}

// Copys a file from the src path to the dst path, returns a promise.
function copy(src: string, dst: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const rd = fs.createReadStream(src);
    rd.on("error", err => {
      reject(err);
    });
    const wr = fs.createWriteStream(dst);
    wr.on("error", reject);
    wr.on("close", resolve);
    rd.pipe(wr);
  });
}
