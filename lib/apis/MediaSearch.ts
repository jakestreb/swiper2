import TMDB from './libs/TMDB';
import TVDB from './libs/TVDB';
import * as log from '../log';

export default class MediaSearch {
  public static async search(info: MediaQuery): Promise<IMedia> {
    log.debug(`MediaSearch.search(${JSON.stringify(info)})`);
    const tmdbMedia = await TMDB.search(info);
    if (tmdbMedia.media_type === 'movie') {
      return TMDB.toMovie(tmdbMedia);
    }
    const imdbId = await TMDB.getImdbId(tmdbMedia);
    const tvdbShow = await TVDB.search(imdbId);
    return TVDB.toShow(tvdbShow, imdbId);
  }
}
