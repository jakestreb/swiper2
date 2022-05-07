import db from '../../db';
import Base from './Base';
import TorrentSearch from '../../apis/TorrentSearch';

// For 'searching' videos, backoff check for a torrent
export class AddTorrent extends Base {
	public static schedule: JobSchedule = 'backoff';
	public static initDelayS: number = 60 * 15;

	public async run(videoId: number): Promise<boolean> {
		const video = await db.videos.get(videoId);
		if (!video) {
			throw new Error(`AddTorrent job run on invalid videoId: ${videoId}`);
		}
		const torrent = await TorrentSearch.addBestTorrent(video);
		if (torrent) {
			await db.videos.setStatus(video, 'downloading');
			await db.torrents.insert(torrent);
			this.swiper.downloadManager.ping();
			return true;
		}
		return false;
	}
}
