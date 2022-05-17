import * as events from 'events';
import getFolderSize from 'get-folder-size';
import rmfr from 'rmfr';
import * as path from 'path';
import WebTorrent from 'webtorrent';
import * as log from './log';
import * as util from './util';
import { promisify } from 'util';

const getFolderSizeAsync = promisify(getFolderSize);

export class DownloadClient extends events.EventEmitter {
  private _client: WebTorrent.Instance|null;

  constructor(public downloadRoot: string) {
    super();
  }

  // TODO: Remove
  public logTorrents() {
    console.warn('TORRENTS', this.client.torrents.map(t => t.magnetURI));
  }

  public getDownloadedMb(t: ITorrent): Promise<number> {
    return getDirectorySizeMb(path.join(this.downloadRoot, t.getDownloadPath()));
  }

  public async download(vt: VTorrent): Promise<void> {
    log.debug(`DownloadClient: download(${vt.video})`);
    const subDirs = vt.getDownloadPath();
    const downloadPath = await util.createSubdirs(this.downloadRoot, subDirs);
    return new Promise((resolve, reject) => {
      this.client.add(vt.magnet, { path: downloadPath }, wtTorrent => {
        wtTorrent.on('done', async () => {
          log.subProcess(`Torrent done ${vt.video}`);
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
      speed: wtTorrent ? wtTorrent.downloadSpeed / (1024 * 1024) : 0, // MB/s
      remaining: wtTorrent ? Math.round(wtTorrent.timeRemaining / (60 * 1000)) : -1,
      peers: wtTorrent ? wtTorrent.numPeers : 0,
    };
  }

  public async stopDownload(magnet: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.remove(magnet, {}, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public async destroyAndDeleteVideo(video: TVideo): Promise<void> {
    await Promise.all(video.torrents.map(t => this.destroyTorrent(t)));
    await this.deleteVideoFiles(video);
  }

  public async destroyAndDeleteTorrent(torrent: VTorrent): Promise<void> {
    await this.destroyTorrent(torrent);
    await this.deleteTorrentFiles(torrent);
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

  private async destroyTorrent(torrent: ITorrent): Promise<void> {
    const torrentPath = path.join(this.downloadRoot, torrent.getDownloadPath());
    const toDestroy = this.client.torrents.find(ct => ct.path === torrentPath);
    if (!toDestroy) {
      throw new Error(`Failed to identify torrent for destruction: ${torrent}`);
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
    this._client = new WebTorrent();
    this._client.on('error', (err) => {
      log.subProcessError(`WebTorrent fatal error: ${err}`);
      this.startClient();
    });
  }
}

async function getDirectorySizeMb(directory: string): Promise<number> {
  try {
    const folderSize = await getFolderSizeAsync(directory);
    return folderSize / 1024 / 1024;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return 0;
    }
    throw err;
  }
}
