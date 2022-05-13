import db from '../db';
import * as mediaUtil from '../common/media';
import {getAiredStr, getMorning} from '../common/util';
import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

// const UP_ARROW = '\u2191';
// const DOWN_ARROW = '\u2913';
// const HOURGLASS = '\u29D6';

export async function scheduled(this: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  const unreleased = await db.media.getWithStatus('unreleased');

  const unreleasedRows = unreleased.map(media => {
    if (media.type === 'movie') {
      const release = media.streamingRelease && (media.streamingRelease > getMorning().getTime());
      const releaseStr = release ? ` _Streaming ${new Date(media.streamingRelease!).toDateString()}_` : ` _${media.year}_`;
      return `${f.b(media.title)}${releaseStr}`;
    } else {
      const next = mediaUtil.getNextToAir(media.episodes);
      return `${f.res(media)}` +
        ((next && next.airDate) ? ` ${f.i(getAiredStr(new Date(next!.airDate!)))}` : '');
    }
  });

  return {
    data: unreleasedRows.length > 0 ? unreleasedRows.join('\n') : 'No scheduled downloads',
    final: true
  };
}

// function formatMovieRow(movie: Movie) {
//   const release = media.streamingRelease && (media.streamingRelease > getMorning().getTime());
//   const releaseStr = release ? ` _Streaming ${new Date(media.streamingRelease!).toDateString()}_` : ` _${media.year}_`;
//   return `*${media.title}*${releaseStr}`;
// }

// function formatShowRow(show: Show) {

// }
