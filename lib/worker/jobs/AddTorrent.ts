import db from '../../db';
import Base from './Base';
import TorrentSearch from '../../apis/TorrentSearch';

export default class AddTorrent extends Base {
	public async run(videoId: number): Promise<boolean> {
		const video = await db.videos.get(videoId);
		if (!video) {
			throw new Error(`AddTorrent job run on invalid videoId: ${videoId}`);
		}
		const torrent = await TorrentSearch.addBestTorrent(video);
		return !!torrent;
	}
}
