import db from '../db';
import {getAiredStr, getMorning} from '../common/util';
import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

const CIRCLE_ARROW = '\u21BB'
const HOURGLASS = '\u29D6';

export async function scheduled(this: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  const unreleased = await db.media.getWithStatus('unreleased');

  const shows: string[] = unreleased
    .filter(media => media.type === 'movie')
    .map(movie => formatMovieRow(movie as Movie, f));
  const movies: string[] = unreleased
    .filter(media => media.type === 'tv')
    .map(show => formatShowRow(show as Show, f));

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

function formatMovieRow(movie: Movie, f: TextFormatter) {
  // TODO: Calculate expected release
  const release = movie.theatricalRelease;
  const items = [getIcon(release), f.b(movie.title)];
  if (release) {
    items.push(getAiredStr(new Date(release)));
  }
  return items.join(' ');
}

function formatShowRow(show: Show, f: TextFormatter) {
  const release =
  return `${f.res(media)}` +
    ((next && next.airDate) ? ` ${f.i(getAiredStr(new Date(next!.airDate!)))}` : '');
}

function getIcon(release?: number) {
  const isChecking = !release || (release <= Date.now());
  return isChecking ? CIRCLE_ARROW : HOURGLASS;
}
