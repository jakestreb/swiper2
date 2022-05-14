import db from '../db';
import * as mediaUtil from '../common/media';
import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

export async function download(this: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  let isFullyUnreleased = false;

  const media = convo.media as Media;
  const video: Video|null = mediaUtil.getVideo(media);
  if (video) {
    isFullyUnreleased = isUnreleased(video);
    await db.media.insert(media, {
      addedBy: convo.id,
      status: isFullyUnreleased ? 'unreleased' : 'searching',
    });
    await checkOrAwaitRelease(this, video);
  } else {
    const show = media as Show;
    isFullyUnreleased = !show.episodes.some(e => !isUnreleased(e));
    await db.shows.insert(show, { addedBy: convo.id, status: 'searching' });
    await Promise.all(show.episodes.map(async e => {
      if (isUnreleased(e)) {
        await db.episodes.setStatus(e, 'unreleased');
      }
      await checkOrAwaitRelease(this, e);
    }));
  }
  return {
    data: `${isFullyUnreleased ? 'Scheduled' : 'Queued'} ${f.res(media)} for download`,
    final: true
  };
}

function getDefinitiveRelease(video: Video): number|undefined {
  return (video as Movie).streamingRelease || (video as Episode).airDate;
}

function isUnreleased(video: Video) {
  const definitiveRelease = getDefinitiveRelease(video);
  return Boolean(definitiveRelease && new Date(definitiveRelease) > new Date());
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
