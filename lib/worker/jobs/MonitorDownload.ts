import db from '../../db';
import Base from './Base';

// For 'downloading' videos, backoff check progress to update torrent status
// At certain checkpoints, add additional torrents
export class MonitorDownload extends Base {
	public static schedule: JobSchedule = 'backoff';
	public static initDelayS: number = 60;

	public static async run(videoId: number): Promise<boolean> {
		const video = await db.videos.get(videoId);
		if (!video) {
			throw new Error(`MonitorDownload job run on invalid videoId: ${videoId}`);
		}
		// TODO: Add slow status to torrents, add new torrent eventually
		return false;
	}
}
