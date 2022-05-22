import db from '../../db';
import Base from './Base';

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
			await db.videos.delete(videoId);
		}
		return true;
	}
}
