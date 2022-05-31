import rmfr from 'rmfr';
import * as path from 'path';
import db from './db';
import * as log from './log';
import * as util from './util';
import ExportHandler from './ExportHandler';
import MemoryManager from './MemoryManager';
import DownloadProcess from './downloader/DownloadProcess';
import Swiper from './Swiper';

export default class DownloadManager {

  private static DOWNLOAD_ROOT = process.env.DOWNLOAD_ROOT || path.resolve(__dirname, '../../downloads');
  private static MAX_DOWNLOADS = parseInt(process.env.MAX_DOWNLOADS || '1', 10);

  public downloadRoot = DownloadManager.DOWNLOAD_ROOT;

  public downloadProcess: DownloadProcess;
  private exportHandler: ExportHandler;
  public memoryManager: MemoryManager;

  private managingPromise: Promise<void>;
  private inProgress: boolean = false;
  private isStarted: boolean = false;

  constructor(public swiper: Swiper) {
    this.downloadProcess = new DownloadProcess(this.downloadRoot);
    this.exportHandler = new ExportHandler(this.downloadRoot);
    this.memoryManager = new MemoryManager(this.downloadRoot);

    this.downloadProcess.start();

    this.ping();
    this.startUploads();
  }

  public async addToQueue(video: IVideo): Promise<void> {
    if (video.status !== 'downloading') {
      await db.videos.setStatus(video, 'downloading');
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
      log.subProcessError(`DownloadManager _ping failed with error: ${err}`);
    });
  }

  public getProgress(torrent: ITorrent, timeoutMs?: number): Promise<DownloadProgress> {
    return this.downloadProcess.getProgress(torrent, timeoutMs);
  }

  public async destroyAndDeleteVideo(video: TVideo): Promise<void> {
    await Promise.all(video.torrents.map(t => this.downloadProcess.destroyTorrent(t)));
    await this.deleteVideoFiles(video);
  }

  public async destroyAndDeleteTorrent(torrent: VTorrent): Promise<void> {
    await this.downloadProcess.destroyTorrent(torrent);
    await this.deleteTorrentFiles(torrent);
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
  // - a new download is added
  // - a new torrent is added to a video
  // - a download completes
  // - a torrent download is marked/unmarked as 'slow'
  private async manageDownloads(): Promise<void> {
    log.debug(`DownloadManager: manageDownloads()`);

    const downloads: IVideo[] = await db.videos.getWithStatus('downloading');
    const withTorrents = await Promise.all(downloads.map(d => db.videos.addTorrents(d)));

    // Sort videos and video torrents by priority
    const sorted = util.sortByPriority(withTorrents, this.getVideoPriority.bind(this));

    const sortedTorrents: VTorrent[] = [];
    sorted.forEach(async v => {
      const ts = util.sortByPriority(v.torrents, this.getTorrentPriority.bind(this));
      ts.forEach(t => {
        (t as VTorrent).video = v;
      });
      sortedTorrents.push(...(ts as VTorrent[]));
    });

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
      const spotsLeft = spotsRemaining > 0;
      const info = JSON.stringify({
        spotsRemaining,
        storageRemaining,
        allocateMb,
        progressMb,
      });
      log.debug(`${spaceLeft && spotsLeft ? '' : 'Not'} queuing ${vt.video}: ${info}`);

      if (spaceLeft && spotsLeft) {
        // Allocate
        storageRemaining -= allocateMb;
        spotsRemaining -= 1;
        if (!this.isStarted || vt.status === 'paused' || vt.status === 'pending') {
          toStart.push(vt);
        }
      } else if (vt.status !== 'paused' && vt.status !== 'pending') {
        toPause.push(vt);
      }
    }, Promise.resolve());

    log.debug(`DownloadManager: manageDownloads() starting ${toStart.length}`);
    log.debug(`DownloadManager: manageDownloads() stopping ${toPause.length}`);

    toStart.forEach(vt => {
      this.startDownload(vt)
        .catch(err => {
          log.error(`Downloading ${vt.video} failed: ${err}`);
        });
    });
    toPause.forEach(vt => {
      this.stopDownload(vt)
        .catch(err => {
          log.error(`Stopping download ${vt.video} failed: ${err}`);
        });
    });

    // Update queue order
    Promise.all([
      db.videos.setQueueOrder(sorted),
      db.torrents.setQueueOrder(sortedTorrents)
    ]).catch(err => {
      log.error(`Failed to set queue order: ${err}`);
    })

    this.isStarted = true;
  }

  private async startDownload(torrent: VTorrent): Promise<void> {
    log.debug(`DownloadManager: startDownload(${torrent.video})`);

    // Run the download
    await db.torrents.setStatus(torrent, 'downloading');
    await this.downloadProcess.download(torrent);
    log.debug(`Torrent ${torrent.video} download completed`);

    // On completion, mark the video status as uploading
    await db.torrents.setStatus(torrent, 'completed');
    await db.videos.setStatus(torrent.video, 'uploading');

    this.upload(torrent.videoId)
      .catch(err => {
        log.error(`Upload error: ${err}`);
      });
  }

  private async stopDownload(torrent: VTorrent): Promise<void> {
    await db.torrents.setStatus(torrent, 'paused');
    await this.downloadProcess.stopDownload(torrent);
  }

  private async startUploads() {
    const videos = await db.videos.getWithStatus('uploading');
    Promise.all(videos.map(v => this.upload(v.id)))
      .catch(err => {
        log.error(`Upload error: ${err}`);
      });
  }

  private async upload(videoId: number): Promise<void> {
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
    await this.swiper.worker.removeJobs(video.id);
    await this.swiper.worker.addJob({
      type: 'DeleteVideo',
      videoId: video.id,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    this.swiper.notifyClient(video.addedBy!, `${video} upload complete`);

    // Ping since the database changed.
    this.ping();
  }

  private getVideoPriority(video: TVideo): number[] {
    const isSlow = video.torrents.every(t => t.status === 'slow' || t.status === 'paused');
    const isMovie = video.isMovie();
    const season = video.isEpisode() ? video.seasonNum : 0;
    const episode = video.isEpisode() ? video.episodeNum : 0;
    // From important to least
    return [-isSlow, +isMovie, -season, -episode];
  }

  private getTorrentPriority(torrent: ITorrent): number[] {
    const isSlow = torrent.status === 'slow';
    // From important to least
    return [-isSlow];
  }

  private async deleteVideoFiles(video: IVideo): Promise<void> {
    try {
      await rmfr(path.join(this.downloadRoot, video.getDownloadPath()));
    } catch (err) {
      log.subProcessError(`Error deleting video files: ${err}`);
    }
  }

  private async deleteTorrentFiles(torrent: ITorrent): Promise<void> {
    try {
      await rmfr(path.join(this.downloadRoot, torrent.getDownloadPath()));
    } catch (err) {
      log.subProcessError(`Error deleting torrent files: ${err}`);
    }
  }
}
