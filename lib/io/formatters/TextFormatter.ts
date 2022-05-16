import * as mediaUtil from '../../common/media';

const NO_PEERS = '(awaiting peers)';
const PAUSED = '(awaiting space)';
const REMOVED = '(removed)';

export default class TextFormatter {

  // TODO: Move to models
	public res(any: Movie|Show|Episode): string {
    const f = this;
	  if (any.type === 'episode') {
	    return f.b(`${any.showTitle} S${any.seasonNum} E${any.episodeNum}`);
	  } else if (any.type === 'tv') {
	    return `${f.b(any.title)} (${mediaUtil.getExpandedEpisodeStr(any.episodes)})`;
	  } else {
	    return f.b(any.title);
	  }
	}

	public torrentRow(t: DBTorrent, peers: number, progress: number): string {
		const f = this;
	  const data = f.dataRow(
	    t.resolution,
	    formatSize(t.sizeMb),
	    formatPeers(peers),
	    formatProgress(progress)
	  );
	  const statusTxt = getTorrentStatusText(t.status, peers);
	  return [data, statusTxt].join(' ');
	}

  public dataRow(...items: Array<string|null>) {
  	return items
  		.filter(x => x)
  		.join(' | ');
  }

  public commands(...rows: string[]) {
  	const f = this;
  	return rows
  		.filter(x => x)
  		.map(r => f.m(`> ${r}`))
  		.join('\n');
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

function getTorrentStatusText(status: TorrentStatus, peers: number) {
	if (status === 'removed') {
		return REMOVED;
	}
  const isPaused = status === 'paused';
  const hasPeers = peers > 0;
  return isPaused ? PAUSED : (!hasPeers ? NO_PEERS : '');
}

function formatSize(sizeMb: number) {
  return sizeMb ? `${(sizeMb / 1000).toFixed(1)}GB` : null;
}

function formatPeers(peers: number): string|null {
  return peers ? `${peers}x` : null;
}

function formatProgress(progress: number) {
  return progress ? `${progress.toFixed(1)}%` : null;
}
