import * as events from 'events';
import getFolderSize from 'get-folder-size';
import rmfr from 'rmfr';
import * as path from 'path';
import WebTorrent from 'webtorrent';
import * as log from './common/logger';
import * as fileUtil from './common/files';
import * as mediaUtil from './common/media';
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

  public getDownloadedMb(t: DBTorrent): Promise<number> {
    return getDirectorySizeMb(path.join(this.downloadRoot, mediaUtil.getTorrentPath(t)));
  }

  public async download(vt: VTorrent): Promise<void> {
    log.debug(`DownloadClient: download(${mediaUtil.stringify(vt.video)})`);
    const subDirs = mediaUtil.getTorrentPath(vt);
    const downloadPath = await fileUtil.createSubdirs(this.downloadRoot, subDirs);
    return new Promise((resolve, reject) => {
      this.client.add(vt.magnet, { path: downloadPath }, wtTorrent => {
        wtTorrent.on('done', async () => {
          log.subProcess(`Torrent done ${mediaUtil.stringify(vt.video)}`);
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
    await this.deleteVideoFiles(video.id);
  }

  public async destroyAndDeleteTorrent(torrent: VTorrent): Promise<void> {
    await this.destroyTorrent(torrent);
    await this.deleteTorrentFiles(torrent);
  }

  private async deleteVideoFiles(videoId: number): Promise<void> {
    try {
      await rmfr(path.join(this.downloadRoot, mediaUtil.getVideoPath(videoId)));
    } catch (err) {
      log.subProcessError(`Error deleting video files: ${err}`);
    }
  }

  private async deleteTorrentFiles(torrent: DBTorrent): Promise<void> {
    try {
      await rmfr(path.join(this.downloadRoot, mediaUtil.getTorrentPath(torrent)));
    } catch (err) {
      log.subProcessError(`Error deleting torrent files: ${err}`);
    }
  }

  private async destroyTorrent(torrent: DBTorrent): Promise<void> {
    const torrentPath = path.join(this.downloadRoot, mediaUtil.getTorrentPath(torrent));
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
