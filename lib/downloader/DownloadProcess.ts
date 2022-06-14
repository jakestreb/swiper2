import ChildProcess from './helper/ChildProcess';
import * as log from '../log';

export default class DownloadProcess extends ChildProcess {
	constructor(downloadRoot: string) {
		super(downloadRoot);
	}

	public get processPath() {
		return './dist/lib/downloader/process/runner';
	}

  public download(vt: VTorrent): Promise<void> {
    log.debug(`DownloadClient: download(${vt.video})`);
    return this.call('download', vt.hash, vt.getDownloadPath());
  }

  public getProgress(torrent: ITorrent, timeoutMs?: number): Promise<DownloadProgress> {
    log.debug(`DownloadClient: getProgress(${torrent.id})`);
    const promise = this.call('getProgress', torrent.hash);
    if (timeoutMs && timeoutMs > 0) {
      const timeoutPromise = new Promise(resolve => {
        const timeout = setTimeout(() => {
          log.error(`getProgress timed out after ${timeoutMs}ms`);
          resolve({});
        }, timeoutMs);
        promise.then(() => clearTimeout(timeout));
      });
      return Promise.race([promise, timeoutPromise]);
    }
    return promise;
  }

  public stopDownload(torrent: ITorrent): Promise<void> {
    return this.call('stopDownload', torrent.hash);
  }

  public destroyTorrent(torrent: ITorrent): Promise<void> {
    return this.call('destroyTorrent', torrent.getDownloadPath());
  }
}