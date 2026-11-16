import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function setup(voices) {
  const said = [],
    warnings = [],
    speaking = [],
    listeners = {};
  const synth = {
    getVoices: () => voices,
    addEventListener: (name, fn) => (listeners[name] = fn),
    cancel() {},
    speak: (u) => said.push(u),
  };
  const context = {
    window: { speechSynthesis: synth },
    setTimeout: () => 1,
    clearTimeout() {},
    Date,
  };
  vm.runInNewContext(
    fs.readFileSync(
      new URL("../public/assets/reward-voice.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  const voice = new context.window.RewardVoice({
    makeUtterance: (text) => ({ text }),
    onWarning: (s) => warnings.push(s),
    onSpeaking: (s) => speaking.push(s),
  });
  voice.setEnabled(true);
  return { voice, said, warnings, speaking, listeners };
}
const v = (name, lang = "vi-VN") => ({ name, lang });
test("female Vietnamese voices outrank male defaults, including accented Hoài My names", () => {
  const f = setup([
    v("Microsoft NamMinh"),
    v("English Female", "en-US"),
    v("Microsoft An"),
    v("Microsoft Hoài My Online (Natural)"),
  ]);
  f.voice.enqueue("Câu hỏi");
  assert.equal(f.said[0].voice.name, "Microsoft Hoài My Online (Natural)");
  assert.equal(f.said[0].rate, 1.04);
  assert.equal(f.said[0].pitch, 1);
});
test("An and Google Vietnamese are selected when Hoai My is absent", () => {
  for (const name of [
    "Microsoft An - Vietnamese (Vietnam)",
    "Google tiếng Việt",
  ]) {
    const f = setup([v("Microsoft NamMinh"), v(name)]);
    f.voice.enqueue("Xuất phát");
    assert.equal(f.said[0].voice.name, name);
  }
});
test("a male-only voice list waits for female voice loading instead of speaking with a male voice", () => {
  const voices = [v("Microsoft NamMinh")],
    f = setup(voices);
  f.voice.enqueue("Chào bạn");
  assert.equal(f.said.length, 0);
  assert.ok(f.warnings[0].includes("giọng nữ"));
  voices.push(v("Microsoft HoaiMy"));
  f.listeners.voiceschanged();
  assert.equal(f.said[0].voice.name, "Microsoft HoaiMy");
});
test("timed questions interrupt rewards, rewards resume, and speech ducking is released", () => {
  const f = setup([v("Microsoft An")]);
  f.voice.enqueue("Cảm ơn quà");
  f.voice.enqueue("Câu hỏi", 2, {
    key: "q",
    expiresAt: Date.now() + 20000,
    interrupt: true,
  });
  assert.equal(f.said[1].text, "Câu hỏi");
  f.said[0].onend();
  assert.equal(f.voice.current.text, "Câu hỏi");
  f.said[1].onend();
  assert.equal(f.said[2].text, "Cảm ơn quà");
  f.said[2].onend();
  assert.equal(f.speaking.at(-1), false);
  assert.equal(f.voice.busy, false);
});
