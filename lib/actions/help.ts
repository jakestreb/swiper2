import Swiper from '../Swiper.js';

const COMMANDS = [{
  name: 'queue',
  description: 'View current downloads',
  basics: [
    'queue',
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
  description: 'View basic information about a show/movie',
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
  description: 'Download a show/movie\nTorrent is automatically selected\nRe-run to download an additional torrent',
  basics: [
    "download [show or movie]",
    "d [show or movie]",
    "d [type] [show or movie] [year]"
  ],
  examples: [
    "download the lion king",
    "d stranger things s2",
    "d batman 1989",
    "d tv fargo"
  ]
}, {
  name: "remove",
  description: "Cancel download of a show/movie\nAllows removing a single torrent from an queued download",
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
  description: "View and select torrent to download for a show/movie\nRe-run to select an additional torrent",
  basics: [
    "search [show or movie]",
    "search [type] [show or movie] [year]"
  ],
  examples: [
    "search game of thrones s1 e2",
    "search home alone 1990",
    "search old yeller",
  ]
}, {
  name: "manual search",
  description: "Manually search for torrents using a custom search term\nUseful when automatic name matching doesn't work",
  basics: [
    "manual search [search term]",
    "manualsearch [search term]",
    "ms [search term]"
  ],
  examples: [
    "manual search the office s01e07",
    "ms the office s01e07",
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
        'queue',
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
