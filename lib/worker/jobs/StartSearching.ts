import db from '../../db/index.js';
import Base from './Base.js';

// For 'unreleased' videos, a one-time event on release to begin searching for
// a torrent
export class StartSearching extends Base {
	public static schedule: JobSchedule = 'once';
	public static initDelayS: number = 0;

	public async run(videoId: number): Promise<boolean> {
		const video = await db.videos.getOne(videoId);
		if (!video) {
			throw new Error(`StartSearching job run on invalid videoId: ${videoId}`);
		}
		await db.videos.setStatus(video, 'searching');
		await this.worker.addJob({
		  type: 'AddTorrent',
		  videoId,
		  startAt: new Date(),
		});
		return true;
	}
}
