import db from '../db';
import Swiper from '../Swiper';

export async function download(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);

  let isAnyReleased = false;

  const media = convo.media as IMedia;
  const video: IVideo|null = media.getVideo();
  if (video) {
    const existing = await db.videos.getOne(video.id);
    const wt = existing ? await db.videos.addTorrents(existing) : null;
    if (wt && wt.status === 'downloading' && wt.torrents.length > 0) {
      // For videos that already have torrents, add another
      await this.worker.addJob({
        type: 'AddTorrent',
        videoId: video.id,
        startAt: new Date(),
      });
      return {
        data: `Added new search for ${video.format(f)}`,
        final: true
      };
    }
    isAnyReleased = isReleased(video);
    try {
      await db.media.insert(media, {
        addedBy: convo.id,
        status: isAnyReleased ? 'searching' : 'unreleased',
      });
    } catch (err) {
      if (err.code !== 'SQLITE_CONSTRAINT') {
        throw err;
      }
      return {
        data: 'Video must be removed before re-downloading',
        final: true
      };
    }
    await checkOrAwaitRelease(this, video);
  } else {
    const show = media as IShow;
    isAnyReleased = show.episodes.some(e => isReleased(e));
    try {
      await db.shows.insert(show, { addedBy: convo.id, status: 'searching' });
    } catch (err) {
      if (err.code !== 'SQLITE_CONSTRAINT') {
        throw err;
      }
      return {
        data: 'Show must be removed before re-downloading',
        final: true
      };
    }
    await Promise.all(show.episodes.map(async e => {
      if (!isReleased(e)) {
        await db.episodes.setStatus(e, 'unreleased');
      }
      await checkOrAwaitRelease(this, e);
    }));
  }
  return {
    data: `${isAnyReleased ? 'Queued' : 'Scheduled'} ${media.format(f)} for download`,
    final: true
  };
}

function getDefinitiveRelease(video: IVideo): Date|undefined {
  const releases = (video as IMovie).releases;
  return releases ? releases.digital : (video as IEpisode).airDate;
}

function isReleased(video: IVideo) {
  const definitiveRelease = getDefinitiveRelease(video);
  return Boolean(definitiveRelease && new Date() >= definitiveRelease);
}

function checkOrAwaitRelease(swiper: Swiper, video: IVideo) {
  const airDate = (video as IEpisode).airDate;
  if (airDate) {
    return swiper.worker.addJob({
      type: 'StartSearching',
      videoId: video.id,
      startAt: airDate,
    });
  }
  return swiper.worker.addJob({
    type: 'CheckForRelease',
    videoId: video.id,
    startAt: (video.isMovie() && video.getSearchDate()) || new Date(),
  });
}
