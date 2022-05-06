import db from '../db';
import worker from '../worker';
import {getDescription, getVideo} from '../common/media';
import Swiper from '../Swiper';

export async function download(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const media = convo.media as Media;
  const video: Video|null = getVideo(media);
  if (video) {
    await db.media.insert(media, { addedBy: convo.id, status: 'unreleased' });
    await checkOrAwaitRelease(video);
  } else {
    const show = media as Show;
    await db.shows.insert(show, { addedBy: convo.id, status: 'unreleased' });
    await Promise.all(show.episodes.map(async e => checkOrAwaitRelease(e)));
  }
  this.downloadManager.ping();
  return {
    data: `Queued ${getDescription(media)} for download`,
    final: true
  };
}

function checkOrAwaitRelease(video: Video) {
  const definitiveRelease = (video as Movie).streamingRelease || (video as Episode).airDate;
  if (definitiveRelease) {
    return worker.addJob({
      type: 'StartSearching',
      videoId: video.id,
      startAt: definitiveRelease,
    })
  }
  return worker.addJob({
    type: 'CheckForRelease',
    videoId: video.id,
    startAt: (video as Movie).theatricalRelease || Date.now(),
  });
}
