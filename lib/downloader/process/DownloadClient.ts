import * as path from 'path';
import WebTorrent from 'webtorrent';
import * as log from '../../log';
import * as util from '../../util';

export default class DownloadClient {
  public static downloadLimitMbps = 40;
  public static uploadLimitMbps = 5;

  private _client: WebTorrent.Instance|null;

  constructor(public downloadRoot: string) {}

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
    return {
      progress: wtTorrent ? wtTorrent.progress * 100 : 0,
      speed: wtTorrent ? wtTorrent.downloadSpeed / (1024 * 1024) : 0, // MB/s
      remaining: wtTorrent ? Math.round(wtTorrent.timeRemaining / (60 * 1000)) : -1,
      peers: wtTorrent ? wtTorrent.numPeers : 0,
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

  // Getter ensures the existence of the WebTorrent instance
  private get client(): WebTorrent.Instance {
    // If the client has shut down, restart it.
    if (!this._client) { this.startClient(); }
    return this._client!;
  }

  private startClient(): void {
    const downloadLimit = (DownloadClient.downloadLimitMbps * 1024 * 1024) / 8;
    const uploadLimit = (DownloadClient.uploadLimitMbps * 1024 * 1024) / 8;
    this._client = new WebTorrent({downloadLimit, uploadLimit} as any);
    this._client.on('error', (err) => {
      log.subProcessError(`WebTorrent fatal error: ${err}`);
      this.startClient(); // Restart webtorrent on error
    });
  }
}