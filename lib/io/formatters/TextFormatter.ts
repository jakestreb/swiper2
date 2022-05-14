import * as mediaUtil from '../../common/media';

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
