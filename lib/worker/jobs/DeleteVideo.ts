import db from '../../db';
import worker from '../../worker';
import Base from './Base';

export default class DeleteVideo extends Base {
	public async run(videoId: number): Promise<boolean> {
		await worker.removeJobs(videoId);
		await db.videos.delete(videoId);
		return true;
	}
}
