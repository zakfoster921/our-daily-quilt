const crypto = require('crypto');

/** Fisher–Yates shuffle; returns a new array (does not mutate input). */
function shuffleQuotes(quotes) {
  const copy = quotes.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

module.exports = { shuffleQuotes };
