import db from './db';
import * as events from 'events';
import rmfr from 'rmfr';
import * as path from 'path';
import WebTorrent from 'webtorrent';
import * as log from './common/logger';
import * as mediaUtil from './common/media';
import * as fs from 'fs';
import {promisify} from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export class DownloadClient extends events.EventEmitter {
  private _client: WebTorrent.Instance|null;

  constructor(public downloadRoot: string) {
    super();
  }

  public getDownloadedMb(t: DBTorrent): Promise<number> {
    return getDirectorySizeMb(path.join(this.downloadRoot, mediaUtil.getTorrentPath(t)));
  }

  public async download(vt: VTorrent): Promise<void> {
    log.debug(`DownloadClient: download(${mediaUtil.getDescription(vt.video)})`);
    const opts = {
      path: path.join(this.downloadRoot, mediaUtil.getTorrentPath(vt)),
      destroyStoreOnDestroy: true,
    };
    return new Promise((resolve, reject) => {
      this.client.add(vt.magnet, opts, wtTorrent => {
        wtTorrent.on('done', async () => {
          log.subProcess(`Torrent done`);
          // Destroy all torrents for video
          const torrents = await db.torrents.getForVideo(vt.videoId);
          const magnets = new Set(torrents.map(t => t.magnet));
          this.client.torrents
            .filter(ct => magnets.has(ct.magnetURI))
            .map(ct => ct.destroy());
          resolve();
        });
        wtTorrent.on('error', async (err) => {
          log.subProcessError(`Torrent error`);
          this.deleteTorrentFiles(vt)
            .catch(err => {
              log.subProcessError(`Torrent file delete error: ${err}`);
            });
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
      progress: wtTorrent ? wtTorrent.progress * 100 : 0,
      speed: wtTorrent ? wtTorrent.downloadSpeed / (1000 * 1000) : 0,
      remaining: wtTorrent ? Math.round(wtTorrent.timeRemaining / (60 * 1000)) : -1,
      peers: wtTorrent ? wtTorrent.numPeers : 0,
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

  public async deleteTorrentFiles(torrent: DBTorrent): Promise<void> {
    try {
      await rmfr(path.join(this.downloadRoot, mediaUtil.getTorrentPath(torrent)));
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
    if (!this._client) { this.startClient(); }
    return this._client!;
  }

  private startClient(): void {
    this._client = new WebTorrent();
    this._client.on('error', (err) => {
      log.subProcessError(`WebTorrent fatal error: ${err}`);
      this.startClient();
    });
  }
}

async function getDirectorySizeMb(directory: string): Promise<number> {
  const files = await readdir(directory);
  const stats = await Promise.all(files.map(file => stat(path.join(directory, file))));
  return stats.reduce((accumulator, { size }) => accumulator + (size / 1000000), 0);
}
