import * as path from 'path';
import WebTorrent from 'webtorrent';
import { Process, runProcess } from '../../../util/process/Process.js';
import logger from '../../../util/logger.js';
import * as util from '../../../util/index.js';

class DownloadProcess extends Process {
  public static downloadLimitMbps = 200;
  public static uploadLimitMbps = 5;

  private client: WebTorrent.Instance;

  constructor(public downloadRoot: string) {
    super();
    this.startClient();
  }

  public async download(hash: string, subPath: string): Promise<void> {
    const downloadPath = await util.createSubdirs(this.downloadRoot, subPath);
    return new Promise((resolve, reject) => {
      console.warn('ADDING TO CLIENT', { client: this.client, hash });
      this.client.add(hash, { path: downloadPath }, wtTorrent => {
        console.warn('WT TORRENT', { wtTorrent });
        wtTorrent.on('done', () => resolve());
        wtTorrent.on('error', (err) => reject(`Torrent download error: ${err}`));
      });
    });
  }

  public async getProgress(hash: string): Promise<DownloadProgress> {
    const wtTorrent = await this.client.get(hash);
    console.warn('PROGRESS', { wtTorrent });
    if (!wtTorrent) {
      return {};
    }
    return {
      progress: wtTorrent.progress * 100,
      speed: wtTorrent.downloadSpeed / (1024 * 1024), // MB/s
      remaining: Math.round(wtTorrent.timeRemaining / (60 * 1000)),
      peers: wtTorrent.numPeers,
    };
  }

  public async stopDownload(hash: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.remove(hash, {}, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public async destroyTorrent(subPath: string): Promise<void> {
    const torrentPath = path.join(this.downloadRoot, subPath);
    const toDestroy = this.client.torrents.find(ct => ct.path === torrentPath);
    if (!toDestroy) {
      // Assume Swiper was reset after download and torrent is already destroyed
      logger.error('Torrent already destroyed');
      return;
    }
    return new Promise((resolve, reject) => {
      toDestroy.destroy({}, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private startClient(): void {
    const downloadLimit = (DownloadProcess.downloadLimitMbps * 1024 * 1024) / 8;
    const uploadLimit = (DownloadProcess.uploadLimitMbps * 1024 * 1024) / 8;
    this.client = new WebTorrent({downloadLimit, uploadLimit} as any);
    this.client.on('error', (err) => {
      logger.error(`WebTorrent fatal error: ${err}`);
      this.startClient(); // Restart webtorrent on error
    });
  }
}

runProcess(DownloadProcess);
