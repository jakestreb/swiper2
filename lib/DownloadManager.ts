import * as path from 'path';
import db from './db';
import * as log from './common/logger';
import {getDescription} from './common/media';
import * as priorityUtil from './common/priority';
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
  private isStarted: boolean = false;

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
      this.managingPromise = this.manageDownloads();
      await this.managingPromise;
      this.inProgress = false;
    }
  }

  // Should be called when:
  // - a new torrent is added to a video
  // - a download completes
  // - a torrent download is marked/unmarked as 'slow'
  private async manageDownloads(): Promise<void> {
    log.debug(`DownloadManager: _manageDownloads()`);

    const downloads: Video[] = await db.videos.getWithStatus('downloading');
    const withTorrents = await Promise.all(downloads.map(d => db.videos.addTorrents(d)));

    // Sort videos and video torrents by priority
    const sorted = priorityUtil.sortByPriority(withTorrents, this.getVideoPriority.bind(this));

    const sortedTorrents: VTorrent[] = [];
    sorted.forEach(v => {
      const ts = priorityUtil.sortByPriority(v.torrents, this.getTorrentPriority.bind(this))
      const vts = ts.map(t => ({ ...t, video: v }));
      sortedTorrents.push(...vts);
    });

    const toStart: VTorrent[] = [];
    const toPause: VTorrent[] = [];

    // Round robin iterate through videos starting any torrents where there's space
    // Once all the space is allocated, pause any remaining torrents
    let storageRemaining = this.memoryManager.freeMb;

    sortedTorrents.reduce(async (prevPromise, vt) => {
      await prevPromise;
      const progressMb = await this.downloadClient.getDownloadedMb(vt);
      const allocateMb = vt.sizeMb - progressMb;
      console.warn(`queue ${getDescription(vt.video)}?`, {
        storageRemaining,
        allocateMb,
        progressMb,
        freeMb: this.memoryManager.freeMb,
        totalMb: this.memoryManager.totalMb,
      });
      if (true || storageRemaining - allocateMb > 0) {
        // Allocate
        storageRemaining -= allocateMb;
        if (!this.isStarted || vt.status === 'paused') {
          toStart.push(vt);
        }
      } else if (vt.status !== 'paused') {
        toPause.push(vt);
      }
    }, Promise.resolve());

    log.debug(`DownloadManager: manageDownloads() starting ${toStart.length}`);
    log.debug(`DownloadManager: manageDownloads() stopping ${toPause.length}`);

    toStart.forEach(vt => {
      this.startDownload(vt)
        .catch(err => {
          log.error(`Downloading ${getDescription(vt.video)} failed: ${err}`);
        });
    });
    toPause.forEach(vt => {
      this.stopDownload(vt)
        .catch(err => {
          log.error(`Stopping download ${getDescription(vt.video)} failed: ${err}`);
        });
    });

    // Update queueNums
    Promise.all([
      db.videos.setQueueOrder(sorted),
      db.torrents.setQueueOrder(sortedTorrents)
    ]).catch(err => {
      log.error(`Failed to set queue order: ${err}`);
    })

    this.isStarted = true;
  }

  private async startDownload(torrent: VTorrent): Promise<void> {
    log.debug(`DownloadManager: startDownload(${getDescription(torrent.video)})`);

    // Run the download
    await db.torrents.setStatus(torrent, 'downloading');
    await this.downloadClient.download(torrent);

    // On completion, mark the video status as uploading.
    await db.videos.setStatus(torrent.video, 'uploading');

    // Export the video (run separately).
    await this.exportHandler.export(torrent)
      .catch(err => {
        log.subProcessError(`Failed to export video files: ${err}`);
      });

    await db.videos.setStatus(torrent.video, 'completed');

    // Ping since the database changed.
    this.ping();
  }

  private async stopDownload(torrent: VTorrent): Promise<void> {
    await db.torrents.setStatus(torrent, 'paused');
    await this.downloadClient.stopDownload(torrent.magnet);
  }

  private getVideoPriority(video: TVideo): number[] {
    const isSlow = video.torrents.every(t => t.status === 'slow' || t.status === 'paused');
    const isMovie = video.type === 'movie';
    const season = video.type === 'episode' ? video.seasonNum : 0;
    const episode = video.type === 'episode' ? video.episodeNum : 0;
    // From important to least
    return [-isSlow, +isMovie, -season, -episode];
  }

  private getTorrentPriority(torrent: DBTorrent): number[] {
    const downloadProgress = this.getProgress(torrent);
    const isSlow = torrent.status === 'slow';
    const { progress, peers } = downloadProgress;
    // From important to least
    return [-isSlow, +progress, +peers];
  }
}
