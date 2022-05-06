import db from '../../db';
import Base from './Base';

export default class CheckForRelease extends Base {
	public static schedule: JobSchedule = 'repeated';
	public static initDelayS: number = 60 * 60 * 12;

	public static async run(videoId: number): Promise<boolean> {
		const video = await db.videos.get(videoId);
		if (!video) {
			throw new Error(`CheckForRelease job run on invalid videoId: ${videoId}`);
		}
		// TODO: Add slow status to torrents, add new torrent eventually
		return false;
	}
}
