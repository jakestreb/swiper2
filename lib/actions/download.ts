import * as mediaUtil from '../common/media';
import db from '../db';
import worker from '../worker';
import {getDescription, getVideo} from '../common/media';
import Swiper from '../Swiper';

export async function download(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  // Check if the media item is a single video for special handling
  const media = convo.media as Media;
  const video: Video|null = getVideo(media);
  if (video) {
    if (mediaUtil.getReleaseDate(video) > new Date()) {
      await awaitRelease(video);
    } else {
      await startBackgroundSearch(video);
      await db.media.insert(media, { addedBy: convo.id, status: 'searching' });
    }
  } else {
    const show = media as Show;
    // Start searching media
    await db.shows.insert(show, { addedBy: convo.id, status: 'unreleased' });
    await Promise.all(show.episodes.map(async e => {
      if (mediaUtil.getReleaseDate(e) > new Date()) {
        await awaitRelease(e);
      } else {
        await startBackgroundSearch(e);
        await db.episodes.setStatus(e, 'searching');
      }
    }));
  }
  this.downloadManager.ping();
  return {
    data: `Queued ${getDescription(media)} for download`,
    final: true
  };
}

function startBackgroundSearch(video: Video) {
  return worker.addJob({
    type: 'AddTorrent',
    videoId: video.id,
    schedule: 'backoff',
    intervalSeconds: 5 * 60,
  });
}

function awaitRelease(video: Video) {
  return worker.addJob({
    type: 'QueueVideo',
    videoId: video.id,
    schedule: 'once',
    intervalSeconds: (mediaUtil.getReleaseDate(video).getTime() - Date.now()) / 1000,
  })
}
