import * as log from '../common/logger';
import {getDescription, getVideo, Media, Video} from '../common/media';
import {Conversation, Swiper, SwiperReply} from '../Swiper';
import {assignMeta, getBestTorrent, Torrent} from '../torrents/util';

export async function download(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  // Check if the media item is a single video for special handling.
  const media = convo.media as Media;
  const video: Video|null = getVideo(media);
  let best: Torrent|null = null;
  if (video) {
    log.info(`Searching for ${getDescription(video)} downloads`);
    const torrents = await this.searchClient.search(video);
    const videoMeta = await this.dbManager.addMetadata(video);
    best = getBestTorrent(videoMeta, torrents);
    if (!best) {
      log.debug(`Swiper: _download failed to find torrent`);
      // If the target is a single video and an automated search failed, show the torrents.
      convo.torrents = torrents;
      convo.commandFn = () => this.search(convo);
      return this.search(convo);
    }
    log.debug(`Swiper: _download best torrent found`);
    // Queue and set the torrent / assign the meta so it doesn't have to be searched again.
    await this.dbManager.addToQueued(media, convo.id);
    await this.dbManager.setTorrent(video.id, best);
    assignMeta(video, best);
  } else {
    // Queue the download.
    await this.dbManager.addToQueued(media, convo.id);
  }

  this.downloadManager.ping();
  return {
    data: `Queued ${getDescription(media)} for download`,
    final: true
  };
}
