import * as path from 'path';
import * as rmfr from 'rmfr';
import * as WebTorrent from 'webtorrent';
import * as log from '../common/logger';
import {DownloadProgress, getIP} from './util';

const DOWNLOAD_ROOT = process.env.DOWNLOAD_ROOT || path.resolve(__dirname, '../downloads');
const WARN_PUBLIC_IP = process.env.WARN_PUBLIC_IP;

export abstract class DownloadClient {
  // Returns the download directory.
  public abstract async download(magnet: string): Promise<string[]>;
  public abstract getProgress(magnet: string): DownloadProgress;
  public abstract async stopDownload(magnet: string): Promise<void>;
  public abstract async deleteFiles(magnet: string): Promise<void>;
  // Indicates that all of the queued downloads have completed. Added to allow removing
  // WebTorrent instance until another download starts to avoid the library's memory leak.
  public abstract allDownloadsCompleted(): void;
}

export class WT extends DownloadClient {
  private _client: WebTorrent.Instance|null;

  constructor() {
    super();
  }

  // Returns the download directory.
  public async download(magnet: string): Promise<string[]> {
    log.debug(`WT: download(${magnet})`);
    await assertIP();
    return new Promise((resolve, reject) => {
      this.client.add(magnet, {path: DOWNLOAD_ROOT}, wtTorrent => {
        wtTorrent.on('done', () => {
          const filePaths = wtTorrent.files.map(f => f.path);
          wtTorrent.destroy();
          resolve(filePaths);
        });
        wtTorrent.on('error', async (err) => {
          this.deleteFiles(magnet).catch(() => { /* noop */ });
          wtTorrent.destroy();
          reject(err);
        });
      });
    });
  }

  public getProgress(magnet: string): DownloadProgress {
    log.debug(`WT: getProgress(${magnet})`);
    const wtTorrent = this.client.get(magnet);
    return {
      progress: wtTorrent ? (wtTorrent.progress * 100).toPrecision(2) : '0',
      speed: wtTorrent ? (wtTorrent.downloadSpeed / (1000 * 1000)).toPrecision(2) : '0',
      remaining: wtTorrent ? Math.round(wtTorrent.timeRemaining / (60 * 1000)).toString() : '',
      peers: wtTorrent ? wtTorrent.numPeers : 0
    };
  }

  public async stopDownload(magnet: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.remove(magnet, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public async deleteFiles(magnet: string): Promise<void> {
    try {
      const wtTorrent = this.client.get(magnet);
      if (!wtTorrent) {
        throw new Error(`torrent not found from magnet`);
      }
      // Get all the paths that should be deleted.
      const paths: string[] = [];
      wtTorrent.files.forEach(file => {
        const torrentDir = file.path.split('/').shift();
        if (torrentDir) {
          const origPath = path.join(wtTorrent.path, torrentDir);
          if (!paths.includes(origPath)) {
            paths.push(origPath);
          }
        }
      });
      // Delete all the paths.
      await Promise.all(paths.map(p => rmfr(p)));
    } catch (err) {
      log.subProcessError(`Error deleting torrent files: ${err}`);
    }
  }

  public allDownloadsCompleted(): void {
    if (this._client) {
      this._client.destroy();
      this._client = null;
    }
  }

  // Getter ensures the existence of the WebTorrent instance
  private get client(): WebTorrent.Instance {
    // If the client has shut down, restart it.
    if (!this._client) { this._startClient(); }
    return this._client!;
  }

  private _startClient(): void {
    this._client = new WebTorrent();
    this._client.on('error', (err) => {
      log.subProcessError(`WebTorrent fatal error: ${err}`);
      this._startClient();
    });
  }
}

async function assertIP() {
  if (!WARN_PUBLIC_IP) {
    return;
  }
  const ip = await getIP();
  if (ip === WARN_PUBLIC_IP) {
    throw new Error('Cannot download with current public IP');
  }
}
