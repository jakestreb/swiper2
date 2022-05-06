import db from '../../db';
import worker from '../../worker';
import Base from './Base';

// For 'completed' videos, delete after some time has passed for cleanup
export class DeleteVideo extends Base {
	public static schedule: JobSchedule = 'once';
	public static initDelayS: number = 0;

	public static async run(videoId: number): Promise<boolean> {
		await worker.removeJobs(videoId);
		await db.videos.delete(videoId);
		return true;
	}
}
