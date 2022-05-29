import ChildProcess from './ChildProcess';
import * as log from '../log';

export default class DownloadProcess extends ChildProcess {
	constructor(downloadRoot: string) {
		super(downloadRoot);
	}

	public get processPath() {
		return './lib/downloader/runner.ts';
	}

  public async download(vt: VTorrent): Promise<void> {
    log.debug(`DownloadClient: download(${vt.video})`);
    return this.call('download', vt.hash, vt.getDownloadPath());
  }

  public getProgress(torrent: ITorrent): Promise<DownloadProgress> {
    log.debug(`DownloadClient: getProgress(${torrent.id})`);
    return this.call('getProgress', torrent.hash);
  }

  public async stopDownload(torrent: ITorrent): Promise<void> {
    return this.call('stopDownload', torrent.hash);
  }

  public async destroyVideoTorrents(video: TVideo): Promise<void> {
    await Promise.all(video.torrents.map(t => this.destroyTorrent(t)));
  }

  public async destroyTorrent(torrent: ITorrent): Promise<void> {
    return this.call('destroyTorrent', torrent.hash);
  }
}
