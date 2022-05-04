import worker from '../../worker';
import db from '../../db';
import Base from './Base';

export default class QueueVideo extends Base {
	public async run(videoId: number): Promise<boolean> {
		const video = await db.videos.get(videoId);
		if (!video) {
			throw new Error(`QueueVideo job run on invalid videoId: ${videoId}`);
		}
		await db.videos.setStatus(video, 'searching');
		await worker.addJob({
		  type: 'AddTorrent',
		  videoId,
		  schedule: 'backoff',
		  intervalSeconds: 5 * 60,
		});
		return true;
	}
}
