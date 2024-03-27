import rmfr from 'rmfr';
import * as path from 'path';
import db from '../../db';
import logger from '../../util/logger';
import * as util from '../../util';
import ExportHandler from '../export/ExportHandler';
import MemoryManager from './MemoryManager';
import DownloadProcessCaller from './process/DownloadProcessCaller';
import Swiper from '../../Swiper';

export default class DownloadManager {

  private static DOWNLOAD_ROOT = process.env.DOWNLOAD_ROOT || path.resolve(__dirname, '../../downloads');
  private static MAX_DOWNLOADS = parseInt(process.env.MAX_DOWNLOADS || '1', 10);

  public downloadRoot = DownloadManager.DOWNLOAD_ROOT;

  public downloader: DownloadProcessCaller;
  private exportHandler: ExportHandler;
  public memoryManager: MemoryManager;

  private managingPromise: Promise<void>;
  private inProgress: boolean = false;
  private isStarted: boolean = false;

  constructor(public swiper: Swiper) {
    logger.info(`DOWNLOAD_ROOT:${DownloadManager.DOWNLOAD_ROOT}`)

    this.downloader = new DownloadProcessCaller(this.downloadRoot);
    this.exportHandler = new ExportHandler(this.downloadRoot);
    this.memoryManager = new MemoryManager(this.downloadRoot);

    this.downloader.on('downloadComplete', (vt: VTorrent) => this.onDownloadComplete(vt));
    this.downloader.start();

    this.ping();
    this.startExports();
  }

  public async addToQueue(video: IVideo): Promise<void> {
    if (video.status !== 'downloading') {
      await db.videos.setStatus(video, 'downloading');
      await db.jobs.markDoneForVideo(video.id, ['AddTorrent', 'CheckForRelease']);
      await this.swiper.worker.addJob({
        type: 'MonitorDownload',
        videoId: video.id,
        startAt: new Date(Date.now() + 60 * 1000),
      });

      this.ping();
    }
  }

  // A non-async public wrapper is used to prevent accidental waiting on the ping function.
  public ping(): void {
    this._ping().catch(err => {
      logger.error(`DownloadManager _ping failed with error: ${err}`);
    });
  }

  public getProgress(torrent: ITorrent, timeoutMs?: number): Promise<DownloadProgress> {
    return this.downloader.getProgress(torrent, timeoutMs);
  }

  public async destroyAndDeleteVideo(video: TVideo): Promise<void> {
    await Promise.all(video.torrents.map(t => this.downloader.destroyTorrent(t)));
    await this.deleteVideoFiles(video);
  }

  public async destroyAndDeleteTorrent(torrent: VTorrent): Promise<void> {
    await this.downloader.destroyTorrent(torrent);
    await this.deleteTorrentFiles(torrent);
  }

  // This function should generally not be awaited.
  private async _ping(): Promise<void> {
    logger.debug(`DownloadManager: _ping()`);
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
  // - a new download is added
  // - a new torrent is added to a video
  // - a download completes
  // - a torrent download is marked/unmarked as 'slow'
  private async manageDownloads(): Promise<void> {
    logger.debug(`DownloadManager: manageDownloads()`);

    const downloads: IVideo[] = await db.videos.getWithStatus('downloading');
    const withTorrents = await Promise.all(downloads.map(d => db.videos.addTorrents(d)));

    // Sort videos and video torrents by priority
    const sorted = util.sortByPriority(withTorrents, this.getVideoPriority.bind(this));

    const videoTorrents = sorted.map(v => {
      const ts = util.sortByPriority(v.torrents, this.getTorrentPriority.bind(this));
      return ts.map(t => t.addVideo(v));
    });

    // Order torrents round robin by video
    const sortedTorrents: VTorrent[] = [];
    let vi = 0, ti = 0;
    while (videoTorrents.length > 0) {
      const ts = videoTorrents[vi];
      if (ti < ts.length) {
        sortedTorrents.push(ts[ti]);
        vi += 1;
      } else {
        videoTorrents.splice(vi, 1);
      }
      if (vi % videoTorrents.length === 0) {
        vi = 0;
        ti += 1;
      }
    }

    const toStart: VTorrent[] = [];
    const toPause: VTorrent[] = [];

    // Iterate through videos starting any torrents where there's space
    // Once all the space is allocated, pause any remaining torrents
    const originalFree = await this.memoryManager.getRemainingMb();
    let storageRemaining = originalFree;
    let spotsRemaining = DownloadManager.MAX_DOWNLOADS;

    await sortedTorrents.reduce(async (prevPromise, vt) => {
      await prevPromise;
      const progressMb = await this.memoryManager.getProgressMb(vt);
      const allocateMb = vt.sizeMb - progressMb;

      const spaceLeft = storageRemaining - allocateMb > 0;
      const spotsLeft = vt.status === 'slow' || spotsRemaining > 0;
      const info = JSON.stringify({
        spotsRemaining,
        storageRemaining,
        allocateMb,
        progressMb,
      });
      logger.debug(`${spaceLeft && spotsLeft ? '' : 'Not '}Queuing ${vt.video}: ${info}`);

      if (spaceLeft && spotsLeft) {
        // Allocate
        storageRemaining -= allocateMb;
        spotsRemaining -= vt.status === 'slow' ? 0 : 1;
        if (!this.isStarted || vt.status === 'paused' || vt.status === 'pending') {
          toStart.push(vt);
        }
      } else if (vt.status !== 'paused' && vt.status !== 'pending') {
        toPause.push(vt);
      }
    }, Promise.resolve());

    logger.debug(`DownloadManager: manageDownloads() starting ${toStart.length}`);
    logger.debug(`DownloadManager: manageDownloads() stopping ${toPause.length}`);

    toStart.forEach(vt => {
      this.startDownload(vt)
        .catch(err => {
          logger.error(`Downloading ${vt.video} failed: ${err}`);
        });
    });
    toPause.forEach(vt => {
      this.stopDownload(vt)
        .catch(err => {
          logger.error(`Stopping download ${vt.video} failed: ${err}`);
        });
    });

    // Update queue order
    Promise.all([
      db.videos.setQueueOrder(sorted),
      db.torrents.setQueueOrder(sortedTorrents)
    ]).catch(err => {
      logger.error(`Failed to set queue order: ${err}`);
    })

    this.isStarted = true;
  }

  private async startDownload(torrent: VTorrent): Promise<void> {
    logger.debug(`DownloadManager: startDownload(${torrent.video})`);

    // Run the download
    await db.torrents.setStatus(torrent, 'downloading');
    return this.downloader.download(torrent);
  }

  private async stopDownload(torrent: VTorrent): Promise<void> {
    await db.torrents.setStatus(torrent, 'paused');
    await this.downloader.stopDownload(torrent);
  }

  private async startExports() {
    const videos = await db.videos.getWithStatus('exporting');
    Promise.all(videos.map(v => this.exportVideo(v.id)))
      .catch(err => {
        logger.error(`Export video error: ${err}`);
      });
  }

  private async exportVideo(videoId: number): Promise<void> {
    const video: IVideo = (await db.videos.getOne(videoId))!;
    const torrents = await db.torrents.getForVideo(video.id);
    const completed = torrents.find(t => t.status === 'completed');
    if (!completed) {
      throw new Error('Export error: no torrents completed');
    }
    const vTorrent = completed.addVideo(video);
    const tVideo = video.addTorrents(torrents);

    // Export and cleanup torrents
    await this.exportHandler.export(vTorrent);
    await this.destroyAndDeleteVideo(tVideo);
    await db.torrents.delete(...torrents.map(t => t.id));

    // Mark video as completed and delete in 24 hours
    await db.videos.setStatus(video, 'completed');
    await this.swiper.worker.addJob({
      type: 'DeleteVideo',
      videoId: video.id,
      startAt: new Date(Date.now() + (24 * 60 * 60 * 1000)),
    });

    this.swiper.notifyClient(video.addedBy!, `${video} download complete`);

    // Ping since the database changed.
    this.ping();
  }

  private getVideoPriority(video: TVideo): number[] {
    const isSlow = video.torrents.every(t => t.status === 'slow' || t.status === 'paused');
    const isMovie = video.isMovie();
    const season = video.isEpisode() ? video.seasonNum : 0;
    const episode = video.isEpisode() ? video.episodeNum : 0;
    // From most important to least
    return [-isSlow, +isMovie, -season, -episode];
  }

  private getTorrentPriority(torrent: ITorrent): number[] {
    const isPaused = torrent.status === 'paused';
    const isSlow = torrent.status === 'slow';
    const isPending = torrent.status === 'pending';
    // From most important to least
    return [-isPaused, -isSlow, -isPending];
  }

  private async deleteVideoFiles(video: IVideo): Promise<void> {
    try {
      await rmfr(path.join(this.downloadRoot, video.getDownloadPath()));
    } catch (err) {
      logger.error(`Error deleting video files: ${err}`);
    }
  }

  private async deleteTorrentFiles(torrent: ITorrent): Promise<void> {
    try {
      await rmfr(path.join(this.downloadRoot, torrent.getDownloadPath()));
    } catch (err) {
      logger.error(`Error deleting torrent files: ${err}`);
    }
  }

  private async onDownloadComplete(vt: VTorrent): Promise<void> {
    logger.debug(`Torrent ${vt.video} download completed`);

    // On completion, mark the video status as exporting
    await db.torrents.setStatus(vt, 'completed');
    await db.videos.setStatus(vt.video, 'exporting');

    this.exportVideo(vt.videoId)
      .catch(err => {
        logger.error(`Export video error: ${err}`);
      });
  }
}
