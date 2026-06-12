/**
 * NapStats — persistent nap history and aggregates, stored in localStorage.
 */
const NapStats = (() => {
  const KEY = "napforge.stats.v1";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { history: [] };
    } catch (_) {
      return { history: [] };
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  /**
   * Record a finished nap.
   * @param {object} nap - { minutes, challenge, snoozes, dismissSeconds, completed }
   */
  function record(nap) {
    const data = load();
    data.history.unshift({ ...nap, at: Date.now() });
    data.history = data.history.slice(0, 50);
    save(data);
  }

  function reset() {
    save({ history: [] });
  }

  /** Consecutive days (ending today) with at least one completed nap. */
  function streak(history) {
    const days = new Set(
      history.filter((h) => h.completed)
        .map((h) => new Date(h.at).toDateString())
    );
    let count = 0;
    const day = new Date();
    while (days.has(day.toDateString())) {
      count++;
      day.setDate(day.getDate() - 1);
    }
    return count;
  }

  function summary() {
    const { history } = load();
    const completed = history.filter((h) => h.completed);
    const totalMinutes = completed.reduce((sum, h) => sum + h.minutes, 0);
    const dismissTimes = completed
      .map((h) => h.dismissSeconds)
      .filter((s) => typeof s === "number");
    const avgDismiss = dismissTimes.length
      ? Math.round(dismissTimes.reduce((a, b) => a + b, 0) / dismissTimes.length)
      : null;
    const totalSnoozes = completed.reduce((sum, h) => sum + (h.snoozes || 0), 0);

    return {
      naps: completed.length,
      totalMinutes,
      avgDismiss,
      totalSnoozes,
      streak: streak(history),
      history,
    };
  }

  return { record, reset, summary };
})();
