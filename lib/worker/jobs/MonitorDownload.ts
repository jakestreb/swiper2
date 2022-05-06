import db from '../../db';
import Base from './Base';

export default class MonitorDownload extends Base {
	public async run(videoId: number): Promise<boolean> {
		const video = await db.videos.get(videoId);
		if (!video) {
			throw new Error(`MonitorDownload job run on invalid videoId: ${videoId}`);
		}
		// TODO: Add slow status to torrents, add new torrent eventually
		return false;
	}
}
