import db from '../db';
import * as util from '../common/util';
import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

const CIRCLE_ARROW = '\u21BB'
const HOURGLASS = '\u29D6';

export async function scheduled(this: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  const unreleased = await db.media.getWithStatus('unreleased');

  const shows: string[] = unreleased
    .filter(media => media.type === 'movie')
    .map(movie => formatMovieRow(movie as IMovie, f));
  const movies: string[] = unreleased
    .filter(media => media.type === 'tv')
    .map(show => formatShowRow(show as IShow, f));

  let rows: string[] = [];
  if (shows.length > 0 && movies.length > 0) {
    rows = [f.u('TV'), ...shows, f.u('Movies'), ...movies];
  } else {
    rows = [...shows, ...movies];
  }

  return {
    data: rows.join('\n') || 'No scheduled downloads',
    final: true
  };
}

function formatMovieRow(movie: IMovie, f: TextFormatter) {
  // TODO: Calculate expected release
  const release = movie.theatricalRelease;
  const items = [getIcon(release), movie.format(f)];
  if (release) {
    const airedStr = util.getAiredStr(new Date(release));
    items.push(f.i(airedStr));
  }
  return items.join(' ');
}

function formatShowRow(show: IShow, f: TextFormatter) {
  const { episodes } = show;
  const next = util.getNextToAir(episodes);
  const last = util.getLastAired(episodes);
  const release = next ? next.airDate : (last ? last.airDate : undefined);
  const items = [getIcon(release), show.format(f)];
  if (release) {
    const airedStr = util.getAiredStr(new Date(release));
    items.push(f.i(airedStr));
  }
  return items.join(' ');
}

function getIcon(release?: number) {
  const isChecking = !release || (release <= Date.now());
  return isChecking ? CIRCLE_ARROW : HOURGLASS;
}
