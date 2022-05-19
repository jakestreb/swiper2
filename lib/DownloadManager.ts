import * as path from 'path';
import db from './db';
import * as log from './log';
import * as util from './util';
import ExportHandler from './ExportHandler';
import MemoryManager from './MemoryManager';
import {DownloadClient} from './DownloadClient';
import Swiper from './Swiper';

export default class DownloadManager {

  private static DOWNLOAD_ROOT = process.env.DOWNLOAD_ROOT || path.resolve(__dirname, '../../downloads');

  public memoryManager: MemoryManager; // TODO: Make private
  public downloadClient: DownloadClient; // TODO: Make private

  private exportHandler: ExportHandler;

  private managingPromise: Promise<void>;
  private inProgress: boolean = false;
  private isStarted: boolean = false;

  constructor(public swiper: Swiper) {
    const downloadRoot = DownloadManager.DOWNLOAD_ROOT;

    this.downloadClient = new DownloadClient(downloadRoot);
    this.memoryManager = new MemoryManager(downloadRoot);
    this.exportHandler = new ExportHandler(downloadRoot);

    this.ping();
    this.startUploads();
  }

  // A non-async public wrapper is used to prevent accidental waiting on the ping function.
  public ping(): void {
    this._ping().catch(err => {
      log.subProcessError(`DownloadManager _ping failed with error: ${err}`);
    });
  }

  public getProgress(torrent: ITorrent): DownloadProgress {
    return this.downloadClient.getProgress(torrent.magnet);
  }

  public destroyAndDeleteVideo(video: TVideo): Promise<void> {
    return this.downloadClient.destroyAndDeleteVideo(video);
  }

  public destroyAndDeleteTorrent(torrent: VTorrent): Promise<void> {
    return this.downloadClient.destroyAndDeleteTorrent(torrent);
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
    sorted.forEach(v => {
      const ts = util.sortByPriority(v.torrents, this.getTorrentPriority.bind(this));
      ts.forEach(t => {
        (t as VTorrent).video = v;
      });
      sortedTorrents.push(...(ts as VTorrent[]));
    });

    const toStart: VTorrent[] = [];
    const toPause: VTorrent[] = [];

    // Round robin iterate through videos starting any torrents where there's space
    // Once all the space is allocated, pause any remaining torrents
    const originalFree = await this.memoryManager.getFreeMb();
    let storageRemaining = originalFree;

    await sortedTorrents.reduce(async (prevPromise, vt) => {
      await prevPromise;
      const progressMb = await this.downloadClient.getDownloadedMb(vt);
      const allocateMb = vt.sizeMb - progressMb;
      console.warn(`queue ${vt.video}?`, {
        storageRemaining,
        allocateMb,
        progressMb,
        freeMb: originalFree,
        totalMb: await this.memoryManager.getTotalMb(),
      });
      if (storageRemaining - allocateMb > 0) {
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
          log.error(`Downloading ${vt.video} failed: ${err}`);
        });
    });
    toPause.forEach(vt => {
      this.stopDownload(vt)
        .catch(err => {
          log.error(`Stopping download ${vt.video} failed: ${err}`);
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
    log.debug(`DownloadManager: startDownload(${torrent.video})`);

    // Run the download
    await db.torrents.setStatus(torrent, 'downloading');
    await this.downloadClient.download(torrent);

    console.warn('DONE DOWNLOADING!', torrent.video);

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
    await this.downloadClient.stopDownload(torrent.magnet);
  }

  private async startUploads() {
    const videos = await db.videos.getWithStatus('uploading');
    Promise.all(videos.map(v => this.upload(v.id)))
      .catch(err => {
        log.error(`Upload error: ${err}`);
      });
  }

  private async upload(videoId: number): Promise<void> {
    const video: IVideo = (await db.videos.get(videoId))!;
    const torrents = await db.torrents.getForVideo(video.id);
    const completed = torrents.find(t => t.status === 'completed');
    if (!completed) {
      throw new Error('Export error: no torrents completed');
    }

    // Export and cleanup torrents
    await this.exportHandler.export({ ...completed, video });
    await this.downloadClient.destroyAndDeleteVideo({ ...video, torrents });
    await db.torrents.delete(...torrents.map(t => t.id));

    // Mark video as completed and delete in 24 hours
    await db.videos.setStatus(video, 'completed');
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
    const downloadProgress = this.getProgress(torrent);
    const isSlow = torrent.status === 'slow';
    const { progress, peers } = downloadProgress;
    // From important to least
    return [-isSlow, +progress, +peers];
  }
}
