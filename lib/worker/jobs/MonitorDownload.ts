import * as util from '../../util';
import db from '../../db';
import Base from './Base';

const SLOW_SPEED_MBS = 0.1;

// For 'downloading' videos, check progress to update torrent statuses
export class MonitorDownload extends Base {
	public static INTERVAL_S = 30;
	public static MARK_SLOW_AFTER = 5;

	public static schedule: JobSchedule = 'once';

	public slowCounts: {[id: number]: number} = {};

	public async run(videoId: number): Promise<boolean> {
		let video = await db.videos.getOne(videoId);

		while (video && video.status === 'downloading') {
			const torrents = await db.torrents.getForVideo(video.id);

			// Mark fast
			await Promise.all(torrents
				.map(async t => {
					const isSlow = await this.isSlow(t);
					if (isSlow) {
						this.slowCounts[t.id] = this.slowCounts[t.id] || 0;
						this.slowCounts[t.id] += 1;
						if (t.status === 'downloading' && this.slowCounts[t.id] >= MonitorDownload.MARK_SLOW_AFTER) {
							await db.torrents.setStatus(t, 'slow');
							this.swiper.downloadManager.ping();
						}
					} else {
						this.slowCounts[t.id] = 0;
						if (t.status === 'slow') {
							await db.torrents.setStatus(t, 'downloading');
						}
					}
				})
			);

			console.warn('torrent slow counts', this.slowCounts);
			await util.delay(MonitorDownload.INTERVAL_S * 1000);
			video = await db.videos.getOne(videoId);
		}

		// Success on completion
		return true;
	}

  private async isSlow(t: ITorrent) {
    const { speed } = await this.swiper.downloadManager.getProgress(t, 5000);
    return speed !== undefined && (speed <= SLOW_SPEED_MBS);
  }
}
