import db from '../../db';
import Base from './Base';
import TorrentSearch from '../../functions/search/TorrentSearch';

// For 'searching' videos, backoff check for a torrent
export class AddTorrent extends Base {
	public static schedule: JobSchedule = 'backoff';
	public static initDelayS: number = 60 * 2;

	public async run(videoId: number): Promise<boolean> {
		const video = await db.videos.getOne(videoId);
		if (!video) {
			throw new Error(`AddTorrent job run on invalid videoId: ${videoId}`);
		}
		const success = await TorrentSearch.addBestTorrent(video);
		if (success) {
			await this.swiper.downloadManager.addToQueue(video);
		}
		return success;
	}
}
