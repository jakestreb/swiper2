import * as mediaUtil from '../../common/media';

export default class TextFormatter {

  // TODO: Move to models
	public res(any: Movie|Show|Episode): string {
    const f = this;
	  if (any.type === 'episode') {
	    return `${f.b(any.showTitle)} (S${any.seasonNum} E${any.episodeNum})`;
	  } else if (any.type === 'tv') {
	    return `${f.b(any.title)} (${mediaUtil.getExpandedEpisodeStr(any.episodes)})`;
	  } else {
	    return `${f.b(any.title)}`;
	  }
	}

  public torrentResult(torrent: TorrentResult): string {
    const f = this;
  const seed = torrent.seeders ? `${torrent.seeders} peers ` : '';
  // const leech = torrent.leechers ? `${torrent.leechers} leech ` : '';
  return `${f.b(torrent.title.replace(/\./g, ' '))}\n` +
    f.i(`${f.sp(7)}${torrent.sizeMb}MB with ${seed}\n`) +
    f.i(`${f.sp(7)}${torrent.uploadTime}`);
  }

  public sp(length: number = 1) {
    return ' '.repeat(length);
  }

	// Bold
	public b(text: string) {
		return text;
	}

	// Italics
	public i(text: string) {
		return text;
	}

	// Underline
	public u(text: string) {
		return text;
	}

	// Strikethrough
	public s(text: string) {
		return text;
	}

	// Monospace
	public m(text: string) {
		return text;
	}
}
