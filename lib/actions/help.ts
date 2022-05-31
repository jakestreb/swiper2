import Swiper from '../Swiper';

const COMMANDS = [{
  name: 'queued',
  description: 'View current downloads',
  basics: [
    'queued',
    'q'
  ],
}, {
  name: 'scheduled',
  description: 'View scheduled downloads',
  basics: [
    'scheduled',
    's'
  ],
}, {
  name: 'info',
  description: 'View release dates for a show/movie',
  basics: [
    "info [show or movie]",
    "i [show or movie]",
  ],
  examples: [
    "info the santa clause",
    "info wandavision",
  ]
}, {
  name: 'download',
  description: 'Download a show/movie\nRe-run to add a torrent',
  basics: [
    "download [show or movie]",
    "d [show or movie]",
  ],
  examples: [
    "download the lion king",
    "download batman 1989",
    "download stranger things s2",
    "download the office s1 e2-4 & e6"
  ]
}, {
  name: "remove",
  description: "Cancel download of a show/movie",
  basics: [
    "remove [show or movie]",
    "r [show or movie]",
  ],
  examples: [
    "remove pulp fiction",
    "remove severance s2",
    "remove the office s1 e2-4 & e6",
  ]
}, {
  name: "remove",
  description: "Cancel selected torrent",
  basics: [
    "remove torrent [show or movie]",
  ],
  examples: [
    "remove torrent pulp fiction",
    "remove torrent severance s2 e1",
    "remove torrent the office"
  ]
}, {
  name: "cancel",
  description: "End the current conversation",
  basics: [
    "cancel",
    "c",
  ]
}, {
  name: "search",
  description: "Select torrent for a show/movie\nRe-run to add a torrent",
  basics: [
    "search [show or movie]",
  ],
  examples: [
    "search old yeller",
    "search game of thrones s1 e2",
  ]
}];

export function help(this: Swiper, convo: Conversation): SwiperReply {
  const f = this.getTextFormatter(convo);

  if (!convo.input) {
    const basics = [
      f.commands(
        `${f.b('download')} [show or movie]`,
        `${f.b('search')} [show or movie]`,
        `${f.b('remove')} [show or movie]`,
        `${f.b('remove torrent')} [show or movie]`
      ),
      f.commands(
        f.b('queued'),
        f.b('scheduled'),
        `${f.b('info')} [show or movie]`
      ),
      f.commands(
        `${f.b('help')} [command]`,
        `${f.b('cancel')} to end any conversation`,
      ),
    ].join('\n\n');

    return {
      data: basics,
      final: true
    };
  } else {
    const cmds = COMMANDS.filter(cmd => cmd.name === convo.input);
    if (!cmds.length) {
      return {
        data: `Command not recognized`,
        final: true
      };
    } else {
      const descriptions = cmds.map(c => {
        const items = [c.description, f.commands(...c.basics)];
        if (c.examples) {
          items.push(f.commands(...c.examples));
        }
        return items.join('\n\n');
      });
      return {
        data: descriptions.join('\n\n'),
        final: true
      };
    }
  }
}
