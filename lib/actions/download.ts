import db from '../db';
import {getDescription, getVideo} from '../common/media';
import Swiper from '../Swiper';

export async function download(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const media = convo.media as Media;
  const video: Video|null = getVideo(media);
  if (video) {
    await db.media.insert(media, {
      addedBy: convo.id,
      status: isUnreleased(video) ? 'unreleased' : 'searching',
    });
    await checkOrAwaitRelease(this, video);
  } else {
    const show = media as Show;
    await db.shows.insert(show, { addedBy: convo.id, status: 'searching' });
    await Promise.all(show.episodes.map(async e => {
      if (isUnreleased(e)) {
        await db.episodes.setStatus(e, 'unreleased');
      }
      await checkOrAwaitRelease(this, e);
    }));
  }
  return {
    data: `Queued ${getDescription(media)} for download`,
    final: true
  };
}

function getDefinitiveRelease(video: Video): number|undefined {
  return (video as Movie).streamingRelease || (video as Episode).airDate;
}

function isUnreleased(video: Video) {
  const definitiveRelease = getDefinitiveRelease(video);
  return definitiveRelease && new Date(definitiveRelease) > new Date();
}

function checkOrAwaitRelease(swiper: Swiper, video: Video) {
  const definitiveRelease = getDefinitiveRelease(video);
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
