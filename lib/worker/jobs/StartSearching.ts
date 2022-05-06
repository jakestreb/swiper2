import worker from '../../worker';
import db from '../../db';
import Base from './Base';

// For 'unreleased' videos, a one-time event on release to begin searching for
// a torrent
export class StartSearching extends Base {
	public static schedule: JobSchedule = 'once';
	public static initDelayS: number = 0;

	public static async run(videoId: number): Promise<boolean> {
		const video = await db.videos.get(videoId);
		if (!video) {
			throw new Error(`StartSearching job run on invalid videoId: ${videoId}`);
		}
		await db.videos.setStatus(video, 'searching');
		await worker.addJob({
		  type: 'AddTorrent',
		  videoId,
		  startAt: Date.now(),
		});
		return true;
	}
}
