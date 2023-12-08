import db from '../../db';
import Base from './Base';
import * as log from '../../util/log';

// For 'completed' videos, delete after some time has passed for cleanup
export class DeleteVideo extends Base {
	public static schedule: JobSchedule = 'once';
	public static initDelayS: number = 0;

	public async run(videoId: number): Promise<boolean> {
		const video = await db.videos.getOne(videoId);
		if (!video) {
			throw new Error(`DeleteVideo job run on invalid videoId: ${videoId}`);
		}
		// Only delete video if status is completed
		if (video.status === 'completed') {
			log.debug(`Deleting completed video ${videoId}`);
			await db.videos.delete(videoId);
		} else {
			log.debug(`Aborting completed video ${videoId} deletion: not completed!`);
		}
		return true;
	}
}
