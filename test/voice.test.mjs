import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function setup(voices, clock = Date) {
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
    Date: clock,
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

test("closing the quiz cancels active and queued questions while preserving reward speech", () => {
  const f = setup([v("Microsoft An")]);
  f.voice.enqueue("Câu đang đọc", 2, { key: "q1" });
  f.voice.enqueue("Đáp án đang chờ", 2, { key: "q2" });
  f.voice.enqueue("Cảm ơn quà");
  const old = f.said[0];
  f.voice.dropQuestions();
  assert.equal(f.voice.current.text, "Cảm ơn quà");
  assert.equal(
    f.voice.items.some((x) => x.priority === 2),
    false,
  );
  old.onend();
  assert.equal(f.voice.current.text, "Cảm ơn quà");
  f.said[1].onend();
  assert.equal(f.voice.busy, false);
});

test("heart thanks resume after a question and duplicate queued thanks are suppressed", () => {
  const f = setup([v("Microsoft An")]);
  f.voice.enqueue("Cảm ơn tim", 0, { key: "thanks:like:a" });
  f.voice.enqueue("Câu hỏi", 2, { key: "q", interrupt: true });
  f.voice.enqueue("Cảm ơn tim", 0, { key: "thanks:like:a" });
  assert.equal(
    f.voice.items.filter((x) => x.key === "thanks:like:a").length,
    1,
  );
  f.said[1].onend();
  assert.equal(f.said[2].text, "Cảm ơn tim");
});
test("a crowded queue drops heart thanks before dropping a gift thank-you", () => {
  const f = setup([v("Microsoft An")]);
  f.voice.enqueue("Câu hỏi", 2);
  for (let i = 0; i < 30; i++)
    f.voice.enqueue("Tim " + i, 0, { key: "heart" + i });
  f.voice.enqueue("Cảm ơn hoa", 1);
  assert.equal(f.voice.items.length, 30);
  assert.ok(f.voice.items.some((x) => x.text === "Cảm ơn hoa"));
});

test("real viewer comments take the next turn before gifts and heart thanks", () => {
  const f = setup([v("Microsoft An")]);
  f.voice.enqueue("Câu hỏi", 2);
  f.voice.enqueue("Tim", 0);
  f.voice.enqueue("Quà", 1);
  f.voice.enqueue("Bình luận thật", 1.5);
  f.said[0].onend();
  assert.equal(f.said[1].text, "Bình luận thật");
  f.said[1].onend();
  assert.equal(f.said[2].text, "Quà");
});
test("bot hearts never speak, bot gifts are globally limited, and real viewers interrupt bot speech", () => {
  const f = setup([v("Microsoft An")]);
  f.voice.enqueue("Tim bot", 0, { demo: true, kind: "like" });
  assert.equal(f.said.length, 0);
  f.voice.enqueue("Quà bot", 1, { demo: true, kind: "gift" });
  assert.equal(f.said.length, 1);
  f.voice.enqueue("Bình luận thật", 1.5);
  assert.equal(f.said[1].text, "Bình luận thật");
  f.said[0].onend();
  assert.equal(f.voice.current.text, "Bình luận thật");
  f.said[1].onend();
  f.voice.enqueue("Quà bot khác", 1, { demo: true, kind: "gift" });
  assert.equal(f.said.length, 2);
});
test("quiet result windows hold real thanks, discard bot rewards and still allow the answer", () => {
  const f = setup([v("Microsoft An")]);
  f.voice.enqueue("Quà thật", 1);
  f.voice.setQuiet(true);
  assert.equal(f.voice.busy, false);
  f.voice.enqueue("Bình luận thật", 1.5);
  f.voice.enqueue("Quà bot", 1, { demo: true, kind: "gift" });
  assert.equal(f.said.length, 1);
  f.voice.enqueue("Đáp án B", 2, { interrupt: true });
  assert.equal(f.said[1].text, "Đáp án B");
  f.said[1].onend();
  assert.equal(f.said.length, 2);
  f.voice.setQuiet(false);
  assert.equal(f.said[2].text, "Bình luận thật");
  f.said[2].onend();
  assert.equal(f.said[3].text, "Quà thật");
});
test("a winner can speak during a quiet window while expired answers/comments are dropped", () => {
  const f = setup([v("Microsoft An")]);
  f.voice.setQuiet(true);
  f.voice.enqueue("Bình luận cũ", 1.5, { expiresAt: Date.now() - 1 });
  f.voice.enqueue("Vô địch", 3, {
    interrupt: true,
    demo: true,
    kind: "winner",
  });
  assert.equal(f.said[0].text, "Vô địch");
  f.said[0].onend();
  f.voice.setQuiet(false);
  assert.equal(f.said.length, 1);
});

test("bot gift speech has a shared sixty-second cooldown across all bots", () => {
  let now = 1000;
  const f = setup([v("Microsoft An")], { now: () => now });
  f.voice.enqueue("Quà bot 1", 1, { demo: true, kind: "gift" });
  f.said[0].onend();
  now += 59999;
  f.voice.enqueue("Quà bot 2", 1, { demo: true, kind: "gift" });
  assert.equal(f.said.length, 1);
  now++;
  f.voice.enqueue("Quà bot 3", 1, { demo: true, kind: "gift" });
  assert.equal(f.said.length, 2);
});
