import * as log from '../common/logger';
import db from '../db';
import {getDescription, getVideo} from '../common/media';
import Swiper from '../Swiper';

export async function download(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  // Check if the media item is a single video for special handling.
  const media = convo.media as Media;
  const video: Video|null = getVideo(media);
  let best: TorrentResult|null = null;
  if (video) {
    log.info(`Searching for ${getDescription(video)} downloads`);
    const torrents = await this.searchClient.search(video);
    best = getBestTorrent(video, torrents);
    if (!best) {
      log.debug(`Swiper: _download failed to find torrent`);
      // If the target is a single video and an automated search failed, show the torrents.
      convo.torrents = torrents;
      convo.commandFn = () => this.search(convo);
      return this.search(convo);
    }
    log.debug(`Swiper: _download best torrent found`);
    // Queue and set the torrent / assign the meta so it doesn't have to be searched again.
    await db.media.insert(media, { addedBy: convo.id, status: 'queued' });
    await db.torrents.insert({ ...best, videoId: video.id });
  } else {
    // Queue the download.
    await db.media.insert(media, { addedBy: convo.id, status: 'queued' });
  }

  this.downloadManager.ping();
  return {
    data: `Queued ${getDescription(media)} for download`,
    final: true
  };
}
