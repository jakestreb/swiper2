export default class TextFormatter {
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
