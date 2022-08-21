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
    "i wandavision",
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
    "d batman 1989",
    "d stranger things s2",
    "d the office s1 e2-4 & e6"
  ]
}, {
  name: "remove",
  description: "Cancel download of a show/movie\nRemove a torrent from a single download",
  basics: [
    "remove [show or movie]",
    "r [show or movie]",
  ],
  examples: [
    "remove pulp fiction",
    "r severance s2",
    "r the office s1 e2-4 & e6",
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
  description: "Show torrents for a show/movie\nRe-run to select a torrent to add",
  basics: [
    "search [show or movie]",
  ],
  examples: [
    "search old yeller",
    "search game of thrones s1 e2",
  ]
}, {
  name: "reboot",
  description: "Reboot Swiper process",
  basics: [
    "reboot",
  ]
}];

export function help(this: Swiper, convo: Conversation): SwiperReply {
  const f = this.getTextFormatter(convo);

  if (!convo.input) {
    const basics = [
      f.commands(
        'download [show or movie]',
        'search [show or movie]',
        'remove [show or movie]',
      ),
      f.commands(
        'queued',
        'scheduled',
        'info [show or movie]',
      ),
      f.commands(
        'help [command]',
        'reboot',
        'cancel to end any conversation',
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
