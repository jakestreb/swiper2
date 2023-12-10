import * as path from 'path';
import ProcessCaller from '../../../util/process/ProcessCaller';
import logger from '../../../util/logger';

export default class DownloadProcessCaller extends ProcessCaller {
  public activeDownloads: {[hash: string]: VTorrent} = {};

	constructor(downloadRoot: string) {
		super(downloadRoot);

    // On start, restart all active downloads
    this.on('start', async () => {
      await Promise.all(
        Object.keys(this.activeDownloads)
        .map(hash => this.activeDownloads[hash])
        .map(t => {
          logger.info(`Restarting download: ${t}`);
          this.download(t);
        })
      );
    });
	}

  public get processPath(): string {
    return path.join(__dirname, 'DownloadProcess');  
  }

  public async download(vt: VTorrent): Promise<void> {
    logger.debug(`DownloadClient: download(${vt.video})`);
    this.activeDownloads[vt.hash] = vt;
    await this.call('download', vt.hash, vt.getDownloadPath());
    this.emit('downloadComplete', vt);
    return;
  }

  public async getProgress(torrent: ITorrent, timeoutMs?: number): Promise<DownloadProgress> {
    logger.debug(`DownloadClient: getProgress(${torrent.id})`);
    try {
      return await this.callWithTimeout('getProgress', timeoutMs || 0, torrent.hash);
    } catch (err) {
      logger.error(`DownloadClient: getProgress(${torrent.id}) failed`);
      return {};
    }
  }

  public stopDownload(torrent: ITorrent): Promise<void> {
    delete this.activeDownloads[torrent.hash];
    return this.call('stopDownload', torrent.hash);
  }

  public destroyTorrent(torrent: ITorrent): Promise<void> {
    delete this.activeDownloads[torrent.hash];
    return this.call('destroyTorrent', torrent.getDownloadPath());
  }
}
