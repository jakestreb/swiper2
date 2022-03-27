import * as events from 'events';
import rmfr from 'rmfr';
import * as path from 'path';
import * as publicIp from 'public-ip';
import WebTorrent from 'webtorrent';
import {OperationMode} from '../Swiper';
import * as log from '../common/logger';
import {DownloadProgress} from './util';

const SAFE_IP_REGEX = process.env.SAFE_IP_REGEX || '0\\.0\\.0\\.0';
const DOWNLOAD_ROOT = process.env.DOWNLOAD_ROOT || path.resolve(__dirname, '../../../downloads');
const IP_CHECK_INTERVAL = 2000;

export class DownloadClient extends events.EventEmitter {
  private _client: WebTorrent.Instance|null;

  // If the instance is marked offline, it can no longer be used for anything.
  private _isOffline: boolean;

  // Indicates whether the ip ping is currently occurring.
  private _pinging: boolean = false;
  // Indicates whether to ip ping again immediately after the current ping.
  private _pingAgain: boolean = false;

  constructor(mode: OperationMode) {
    super();

    this._isOffline = mode === 'offline';

    // Verify IP every N ms
    if (process.env.USE_KILLSWITCH !== '0') {
      setInterval(() => this._pingIp().catch(() => { /* noop */ }), IP_CHECK_INTERVAL);
    }
  }

  // Returns the download directory.
  public async download(magnet: string): Promise<string[]> {
    log.debug(`DownloadClient: download(${magnet})`);
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
    log.debug(`DownloadClient: getProgress(${magnet})`);
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
    if (!this._client && !this._isOffline) { this._startClient(); }
    return this._client!;
  }

  private _startClient(): void {
    this._client = new WebTorrent();
    this._client.on('error', (err) => {
      log.subProcessError(`WebTorrent fatal error: ${err}`);
      this._startClient();
    });
  }

  private async _pingIp(): Promise<void> {
    if (this._pinging) {
      this._pingAgain = true;
      return;
    }
    this._pinging = true;

    const regex = new RegExp(SAFE_IP_REGEX, 'g');

    // Noop if client isn't active but not offline
    if (this._client) {
      try {
        const ip = await publicIp.v4();
        if (!ip.match(regex)) {
          log.error(`Cannot download via ${ip}, going offline`);
          this._setOffline();
        }
      } catch (err) {
        // Failed to find IP,
        log.error(`Failed to find IP, going offline: ${err}`);
        this._setOffline();
      }
    } else if (this._isOffline) {
      try {
        const ip = await publicIp.v4();
        if (ip.match(regex)) {
          log.info(`IP changed to ${ip}, going back online`);
          this._setOnline();
        }
      } catch (err) {
        // Failed to find IP,
        log.error(`Failed to find IP, remaining offline`);
      };
    }

    this._pinging = false;
    if (this._pingAgain) {
      this._pingAgain = false;
      setTimeout(() => this._pingIp().catch(() => { /* noop */ }), 0);
    }
  }

  private _setOnline(): void {
    this._isOffline = false;
    this.emit('online');
  }

  private _setOffline(): void {
    if (this._client) {
      this._client!.destroy();
      this._client = null;
    }
    this._isOffline = true;
    this.emit('offline');
  }
}
