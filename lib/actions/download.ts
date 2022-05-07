import db from '../db';
import {getDescription, getVideo} from '../common/media';
import Swiper from '../Swiper';

export async function download(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const media = convo.media as Media;
  const video: Video|null = getVideo(media);
  if (video) {
    await db.media.insert(media, { addedBy: convo.id, status: 'searching' });
    await checkOrAwaitRelease(this, video);
  } else {
    const show = media as Show;
    await db.shows.insert(show, { addedBy: convo.id, status: 'searching' });
    await Promise.all(show.episodes.map(async e => checkOrAwaitRelease(this, e)));
  }
  return {
    data: `Queued ${getDescription(media)} for download`,
    final: true
  };
}

function checkOrAwaitRelease(swiper: Swiper, video: Video) {
  const definitiveRelease = (video as Movie).streamingRelease || (video as Episode).airDate;
  if (definitiveRelease) {
    return swiper.worker.addJob({
      type: 'StartSearching',
      videoId: video.id,
      startAt: definitiveRelease,
    })
  }
  return swiper.worker.addJob({
    type: 'CheckForRelease',
    videoId: video.id,
    startAt: (video as Movie).theatricalRelease || Date.now(),
  });
}
