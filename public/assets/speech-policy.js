// Shared by state updates and the local clock so quiet windows begin on time.
export function quietForResults(game, now) {
  if (game.awaitingAwards) return true;
  const q = game.quiz;
  if (
    q &&
    (q.phase === "reveal" ||
      (q.phase === "question" && q.deadline - now <= 5000))
  )
    return true;
  const leader = game.racers?.[0];
  if (game.phase === "racing" && leader && !leader.finishedAt) {
    const remaining =
      game.config.laps * game.config.trackLength - leader.progress;
    if (remaining <= Math.max(80, (leader.speed || 0) * 8)) return true;
  }
  return (
    game.phase === "finished" &&
    game.config.autoNext &&
    game.phaseDeadline - now <= 3000
  );
}
