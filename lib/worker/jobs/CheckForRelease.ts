import db from '../../db';
import Base from './Base';
import TorrentSearch from '../../apis/TorrentSearch';

// For 'unreleased' movies without a clear release date, repeatedly search and set
// directly to 'downloading' when a torrent is found
export class CheckForRelease extends Base {
	public static schedule: JobSchedule = 'repeated';
	public static initDelayS: number = 60 * 60 * 12;

	public static async run(videoId: number): Promise<boolean> {
		const video = await db.videos.get(videoId);
		if (!video) {
			throw new Error(`CheckForRelease job run on invalid videoId: ${videoId}`);
		}
		const torrent = await TorrentSearch.addBestTorrent(video);
		if (torrent) {
			await db.videos.setStatus(video, 'downloading');
			return true;
		}
		return false;
	}
}
