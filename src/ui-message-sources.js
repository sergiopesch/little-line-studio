// Stable identities let the same English wording vary by purpose in each locale.
export const UI_MESSAGE_SOURCES = Object.freeze({
  "lesson.pause": "Pause",
  "lesson.moreTime": "More time",
  "lesson.replayInstruction": "Listen again",
  "lesson.replayDemonstration": "Show again",
  "help.playHint": "Hear the hint",
  "help.stopHint": "Stop hint",
  "setup.stopVoicePreview": "Stop voice check",
  "settings.stopVoicePreview": "Stop voice check"
});

export function resolveUIMessage(dictionary, message) {
  const source = Object.hasOwn(UI_MESSAGE_SOURCES, message) ? UI_MESSAGE_SOURCES[message] : message;
  if (dictionary && Object.hasOwn(dictionary, message)) return dictionary[message];
  return dictionary && Object.hasOwn(dictionary, source) ? dictionary[source] : source;
}
