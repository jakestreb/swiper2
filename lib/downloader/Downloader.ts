import ProcessManager from './helper/ProcessManager';
import * as log from '../log';

export default class Downloader extends ProcessManager {
  public activeDownloads: {[hash: string]: VTorrent} = {};

	constructor(downloadRoot: string) {
		super(downloadRoot);

    // On start, restart all active downloads
    this.on('start', async () => {
      await Promise.all(
        Object.keys(this.activeDownloads)
        .map(hash => this.activeDownloads[hash])
        .map(t => {
          log.info(`Restarting download: ${t}`);
          this.download(t);
        })
      );
    });
	}

	public get processPath() {
		return './dist/lib/downloader/process/runner';
	}

  public download(vt: VTorrent): Promise<void> {
    log.debug(`DownloadClient: download(${vt.video})`);
    this.activeDownloads[vt.hash] = vt;
    return this.call('download', vt.hash, vt.getDownloadPath());
  }

  public async getProgress(torrent: ITorrent, timeoutMs?: number): Promise<DownloadProgress> {
    log.debug(`DownloadClient: getProgress(${torrent.id})`);
    try {
      return await this.callWithTimeout('getProgress', timeoutMs || 0, torrent.hash);
    } catch (err) {
      log.error(`DownloadClient: getProgress(${torrent.id}) failed`);
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
