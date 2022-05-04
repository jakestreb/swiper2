import * as path from 'path';
import db from './db';
import * as log from './common/logger';
import {getDescription} from './common/media';
import ExportHandler from './ExportHandler';
import MemoryManager from './MemoryManager';
import {DownloadClient} from './DownloadClient';

export class DownloadManager {

  private static DOWNLOAD_ROOT = process.env.DOWNLOAD_ROOT || path.resolve(__dirname, '../../downloads');

  private downloadClient: DownloadClient;
  private memoryManager: MemoryManager;
  private exportHandler: ExportHandler;

  private managingPromise: Promise<void>;
  private inProgress: boolean = false;

  constructor() {
    const downloadRoot = DownloadManager.DOWNLOAD_ROOT;

    this.downloadClient = new DownloadClient(downloadRoot);
    this.memoryManager = new MemoryManager();
    this.exportHandler = new ExportHandler(downloadRoot);

    this.ping();
  }

  // A non-async public wrapper is used to prevent accidental waiting on the ping function.
  public ping(): void {
    this._ping().catch(err => {
      log.subProcessError(`DownloadManager _ping failed with error: ${err}`);
    });
  }

  public async pingAndWait(): Promise<void> {
    await this._ping();
  }

  public getProgress(torrent: DBTorrent): DownloadProgress {
    return this.downloadClient.getProgress(torrent.magnet);
  }

  // This function should generally not be awaited.
  private async _ping(): Promise<void> {
    log.debug(`DownloadManager: _ping()`);
    await this.managingPromise;
    // If after waiting, the downloads are already being managed again, the goal of the ping
    // is already being accomplished, so this ping can return.
    if (!this.inProgress) {
      this.inProgress = true;
      this.managingPromise = this._manageDownloads();
      await this.managingPromise;
      this.inProgress = false;
    }
  }

  // Should be called when a new torrent is added to a video & when a download completes.
  private async _manageDownloads(): Promise<void> {
    log.debug(`DownloadManager: _manageDownloads()`);

    // TODO: Torrents need running/paused status, videos are always 'searching'/'downloading'

    const queue: Video[] = await db.videos.getWithStatus('searching', 'downloading');
    const updated = this.prioritizeTorrents(queue.map(v => ({ ...v })));

    await db.videos.saveStatuses(updated);

    queue.sort((a, b) => a.id - b.id);
    updated.sort((a, b) => a.id - b.id);

    const start = queue.filter((v, i) => v.status === 'queued' && updated[i].status === 'downloading');
    const stop = queue.filter((v, i) => v.status === 'downloading' && updated[i].status === 'queued');
    log.debug(`DownloadManager: manageDownloads() starting ${start.length}`);
    log.debug(`DownloadManager: manageDownloads() stopping ${stop.length}`);

    // Use the results from the database query to start/stop downloads.
    start.forEach(v => this.startDownload(v));
    stop.forEach(v => this.stopDownload(v));

    // Update downloading array.
    this._downloading = downloads;
    if (downloads.length === 0) {
      this._downloadClient.allDownloadsCompleted();
    }
  }

  // Must be idempotent
  private prioritizeTorrents(videos: TVideo[]): TVideo[] {
    return videos;
  }

  private async startDownload(video: Video, torrent: DBTorrent): Promise<void> {
    log.debug(`DownloadManager: startDownload(${getDescription(video)})`);

    // Run the download
    const downloadPaths = await this.downloadClient.download(torrent.magnet);

    // On completion, remove the item from the database.
    await db.videos.delete(video);

    // Export the video (run separately).
    this.exportHandler.export(video, downloadPaths).catch(err => {
      log.subProcessError(`Failed to export video files: ${err}`);
    });

    // Ping since the database changed.
    this.ping();
  }

  private async stopDownload(torrent: DBTorrent): Promise<void> {
    await this.downloadClient.stopDownload(torrent.magnet);
  }
}
