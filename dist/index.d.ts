declare module "node-tvdb";
declare module "parse-torrent-name";
declare module "terminal-kit" {
  export var terminal: Terminal;
  interface Terminal {
    (...values: any[]): Terminal;
    //Properties
    width: number;
    height: number;

    //Foreground colors
    defaultColor: Terminal;
    black: Terminal;
    red: Terminal;
    green: Terminal;
    yellow: Terminal;
    blue: Terminal;
    magenta: Terminal;
    cyan: Terminal;
    white: Terminal;
    brightBlack: Terminal;
    gray: Terminal;
    brightRed: Terminal;
    brightGreen: Terminal;
    brightYellow: Terminal;
    brightBlue: Terminal;
    brightMagenta: Terminal;
    brightCyan: Terminal;
    brightWhite: Terminal;
    color: Terminal;
    darkColor: Terminal;
    brightColor: Terminal;
    color256: Terminal;
    colorRgb: Terminal;
    colorRgbHex: Terminal;
    colorGrayscale: Terminal;

    //Background colors
    bgDefaultColor: Terminal;
    bgBlack: Terminal;
    bgRed: Terminal;
    bgGreen: Terminal;
    bgYellow: Terminal;
    bgBlue: Terminal;
    bgMagenta: Terminal;
    bgCyan: Terminal;
    bgWhite: Terminal;
    bgDarkColor: Terminal;
    bgBrightBlack: Terminal;
    bgGray: Terminal;
    bgBrightRed: Terminal;
    bgBrightGreen: Terminal;
    bgBrightYellow: Terminal;
    bgBrightBlue: Terminal;
    bgBrightMagenta: Terminal;
    bgBrightCyan: Terminal;
    bgColor: Terminal;
    bgBrightWhite: Terminal;
    bgBrightColor: Terminal;
    bgColor256: Terminal;
    bgColorRgb: Terminal;
    bgColorRgbHex: Terminal;
    bgColorGrayscale: Terminal;

    //Styles
    styleReset: Terminal;
    bold: Terminal;
    dim: Terminal;
    italic: Terminal;
    underline: Terminal;
    blink: Terminal;
    inverse: Terminal;
    hidden: Terminal;
    strike: Terminal;

    //Moving the Cursor
    saveCursor: Terminal;
    restoreCursor: Terminal;
    up: Terminal;
    down: Terminal;
    right: Terminal;
    left: Terminal;
    nextLine: Terminal;
    previousLine: Terminal;
    column: Terminal;
    scrollUp: Terminal;
    scrollDown: Terminal;
    scrollingRegion: Terminal;
    resetScrollingRegion: Terminal;
    moveTo: Terminal;
    move: Terminal;
    hideCursor: Terminal;
    tabSet: Terminal;
    tabClear: Terminal;
    tabClearAll: Terminal;
    forwardTab: Terminal;
    backwardTab: Terminal;

    //Editing the Screen
    clear: Terminal;
    eraseDisplayBelow: Terminal;
    eraseDisplayAbove: Terminal;
    eraseDisplay: Terminal;
    eraseScrollback: Terminal;
    eraseLineAfter: Terminal;
    eraseLineBefore: Terminal;
    eraseLine: Terminal;
    eraseArea: Terminal;
    insertLine: Terminal;
    deleteLine: Terminal;
    insert: Terminal;
    delete: Terminal;
    backDelete: Terminal;
    // scrollUp: Terminal;
    // scrollDown: Terminal;
    alternateScreenBuffer: Terminal;

    //Input/Output
    requestCursorLocation: Terminal;
    requestScreenSize: Terminal;
    requestColor: Terminal;
    applicationKeypad: Terminal;

    //Internal input/output (do not use directly, use grabInput() instead)
    mouseButton: Terminal;
    mouseDrag: Terminal;
    mouseMotion: Terminal;
    mouseSGR: Terminal;
    focusEvent: Terminal;

    //Operating System
    cwd: Terminal;
    windowTitle: Terminal;
    iconName: Terminal;
    notify: Terminal;

    //Modifiers
    error: Terminal;
    str: Terminal;
    noFormat: Terminal;
    markupOnly: Terminal;
    bindArgs: Terminal;

    //Misc
    reset: Terminal;
    bell: Terminal;
    setCursorColor: Terminal;
    setCursorColorRgb: Terminal;
    resetCursorColorRgb: Terminal;
    setDefaultColorRgb: Terminal;
    resetDefaultColorRgb: Terminal;
    setDefaultBgColorRgb: Terminal;
    resetDefaultBgColorRgb: Terminal;
    setHighlightBgColorRgb: Terminal;
    resetHighlightBgColorRgb: Terminal;
  }
}
