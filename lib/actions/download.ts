import db from '../db';
import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

export async function download(this: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  let isFullyUnreleased = false;

  const media = convo.media as IMedia;
  const video: IVideo|null = media.getVideo();
  if (video) {
    const existing = await db.torrents.getForVideo(video.id);
    if (existing.length > 0) {
      // For videos that already have torrents, add another
      await this.worker.addJob({
        type: 'AddTorrent',
        videoId: video.id,
        startAt: Date.now(),
      });
      return {
        data: `Added new search for ${video.format(f)}`,
        final: true
      };
    }
    isFullyUnreleased = isUnreleased(video);
    await db.media.insert(media, {
      addedBy: convo.id,
      status: isFullyUnreleased ? 'unreleased' : 'searching',
    });
    // TODO: If insertion fails
    // return {
    //   data: 'Requested episodes overlap with episodes currently being managed',
    //   final: true
    // };
    await checkOrAwaitRelease(this, video);
  } else {
    const show = media as IShow;
    isFullyUnreleased = !show.episodes.some(e => !isUnreleased(e));
    await db.shows.insert(show, { addedBy: convo.id, status: 'searching' });
    // TODO: If insertion fails
    // return {
    //   data: 'Requested episodes overlap with episodes currently being managed',
    //   final: true
    // };
    await Promise.all(show.episodes.map(async e => {
      if (isUnreleased(e)) {
        await db.episodes.setStatus(e, 'unreleased');
      }
      await checkOrAwaitRelease(this, e);
    }));
  }
  return {
    data: `${isFullyUnreleased ? 'Scheduled' : 'Queued'} ${media.format(f)} for download`,
    final: true
  };
}

function getDefinitiveRelease(video: IVideo): number|undefined {
  return (video as IMovie).streamingRelease || (video as IEpisode).airDate;
}

function isUnreleased(video: IVideo) {
  const definitiveRelease = getDefinitiveRelease(video);
  return Boolean(definitiveRelease && new Date(definitiveRelease) > new Date());
}

function checkOrAwaitRelease(swiper: Swiper, video: IVideo) {
  const definitiveRelease = getDefinitiveRelease(video);
  if (definitiveRelease) {
    return swiper.worker.addJob({
      type: 'StartSearching',
      videoId: video.id,
      startAt: definitiveRelease,
    });
  }
  return swiper.worker.addJob({
    type: 'CheckForRelease',
    videoId: video.id,
    startAt: (video as IMovie).theatricalRelease || Date.now(),
  });
}
