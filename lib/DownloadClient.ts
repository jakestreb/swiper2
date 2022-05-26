import getFolderSize from 'get-folder-size';
import rmfr from 'rmfr';
import * as path from 'path';
import WebTorrent from 'webtorrent';
import * as log from './log';
import * as util from './util';
import { promisify } from 'util';

const getFolderSizeAsync = promisify(getFolderSize);

export class DownloadClient {
  public static MAX_TORRENT_CONNS = 30;

  private _client: WebTorrent.Instance|null;

  constructor(public downloadRoot: string) {}

  // TODO: Remove
  public logTorrents() {
    console.warn('TORRENTS', this.client.torrents.map(t => t.infoHash));
  }

  public getDownloadedMb(t: ITorrent): Promise<number> {
    return getDirectorySizeMb(path.join(this.downloadRoot, t.getDownloadPath()));
  }

  public async download(vt: VTorrent): Promise<void> {
    log.debug(`DownloadClient: download(${vt.video})`);
    const subDirs = vt.getDownloadPath();
    const downloadPath = await util.createSubdirs(this.downloadRoot, subDirs);
    return new Promise((resolve, reject) => {
      this.client.add(vt.hash, { path: downloadPath }, wtTorrent => {
        wtTorrent.on('done', async () => {
          log.subProcess(`Torrent done ${vt.video}`);
          resolve();
        });
        wtTorrent.on('error', async (err) => {
          log.subProcessError(`Torrent error: ${err}`);
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

  public getProgress(torrent: ITorrent): DownloadProgress {
    log.debug(`DownloadClient: getProgress(${torrent.id})`);
    const wtTorrent = this.client.get(torrent.hash);
    if (wtTorrent) {
      console.warn('TORRENT', wtTorrent.infoHash);
    }
    return {
      progress: wtTorrent ? wtTorrent.progress * 100 : 0,
      speed: wtTorrent ? wtTorrent.downloadSpeed / (1024 * 1024) : 0, // MB/s
      remaining: wtTorrent ? Math.round(wtTorrent.timeRemaining / (60 * 1000)) : -1,
      peers: wtTorrent ? wtTorrent.numPeers : 0,
    };
  }

  public async stopDownload(torrent: ITorrent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.remove(torrent.hash, {}, err => {
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
      // Assume Swiper was reset after download and torrent is already destroyed
      log.error(`Torrent ${torrent.id} not found in client to destroy`);
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
    this._client = new WebTorrent({ maxConns: DownloadClient.MAX_TORRENT_CONNS });
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
