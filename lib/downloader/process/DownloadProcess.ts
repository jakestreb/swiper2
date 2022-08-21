import * as path from 'path';
import WebTorrent from 'webtorrent';
import ChildProcess from './ChildProcess';
import * as log from '../../log';
import * as util from '../../util';

export default class DownloadProcess extends ChildProcess {
  public static downloadLimitMbps = 40;
  public static uploadLimitMbps = 5;

  private client: WebTorrent.Instance;

  constructor(public downloadRoot: string) {
    super();
    this.startClient();
  }

  public async download(hash: string, subPath: string): Promise<void> {
    const downloadPath = await util.createSubdirs(this.downloadRoot, subPath);
    return new Promise((resolve, reject) => {
      this.client.add(hash, { path: downloadPath }, wtTorrent => {
        wtTorrent.on('done', () => resolve());
        wtTorrent.on('error', (err) => reject(`Torrent download error: ${err}`));
      });
    });
  }

  public getProgress(hash: string): DownloadProgress {
    const wtTorrent = this.client.get(hash);
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
      log.subProcessError('Torrent already destroyed');
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
      log.subProcessError(`WebTorrent fatal error: ${err}`);
      this.startClient(); // Restart webtorrent on error
    });
  }
}
