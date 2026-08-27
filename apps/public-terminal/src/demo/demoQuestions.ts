// Questions for the demo's study game.
//
// Factual market vocabulary only. Nothing here says what to trade, when, or
// what a price will do — a study game inside a terminal is the easiest place to
// drift into advice by accident, and this is a public showcase.
type Question = {
  seq: number; topic: string; stem: string;
  options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[];
  answer: 'A' | 'B' | 'C' | 'D'; explanation: string | null;
};

const q = (seq: number, topic: string, stem: string, options: string[], answer: 'A'|'B'|'C'|'D', explanation: string): Question => ({
  seq, topic, stem,
  options: (['A', 'B', 'C', 'D'] as const).map((label, i) => ({ label, text: options[i]! })),
  answer, explanation,
});

export const DEMO_QUESTIONS: Question[] = [
  q(1, 'Orders', 'What does a market order do?',
    ['Fills at the best price currently available', 'Fills only at a price you name', 'Fills only after the market closes', 'Cancels every other order first'],
    'A', 'A market order takes the price on offer. A limit order is the one that fills only at a price you name.'),
  q(2, 'Orders', 'A limit order to buy is placed where relative to the current price?',
    ['Above it', 'Below it', 'Exactly at it', 'It has no relationship to price'],
    'B', 'A buy limit sits below the market — you are asking to pay less than the price on offer.'),
  q(3, 'Orders', 'What is a stop loss?',
    ['An order that closes a position once price reaches a set level', 'A guarantee against loss', 'A fee the broker charges', 'The maximum size an account may hold'],
    'A', 'It is an instruction to close at a level. It is not a guarantee — in a fast market it can fill worse than the level set.'),
  q(4, 'Orders', 'What does "slippage" describe?',
    ['The difference between the price expected and the price filled', 'The broker’s commission', 'A gap between two candles', 'The spread on a currency pair'],
    'A', 'Slippage is the gap between the price you expected and the one you got.'),
  q(5, 'Pricing', 'In a quote, the bid is the price at which you can…',
    ['Sell', 'Buy', 'Either, they are the same', 'Neither, it is an average'],
    'A', 'You sell at the bid and buy at the ask. The difference between them is the spread.'),
  q(6, 'Pricing', 'What is the spread?',
    ['The difference between the bid and the ask', 'The move since the open', 'The broker’s overnight charge', 'The distance to your stop'],
    'A', 'It is the gap between the two sides of the quote, and it is a cost you pay on entry.'),
  q(7, 'Pricing', 'For most currency pairs, one pip is a move of…',
    ['0.0001', '0.01', '0.1', '1.00'],
    'A', 'Most pairs quote to four decimal places, so a pip is 0.0001. Yen pairs are the common exception at 0.01.'),
  q(8, 'Pricing', 'On an index or a share, a "point" usually means…',
    ['One whole unit of price', 'One cent', 'One tenth of a unit', 'The same as a pip'],
    'A', 'A point is one whole unit — 5,000 to 5,001. Calling that a pip would quote the figure in the wrong unit.'),
  q(9, 'Sessions', 'Which session opens first in the trading day?',
    ['Sydney', 'London', 'New York', 'Frankfurt'],
    'A', 'The day runs Sydney, then Tokyo, then London, then New York.'),
  q(10, 'Sessions', 'The London and New York sessions overlap for roughly…',
    ['Four hours', 'One hour', 'Twelve hours', 'They never overlap'],
    'A', 'Roughly four hours, which is when volume across the majors is usually highest.'),
  q(11, 'Sessions', 'What is the 5pm ET rollover?',
    ['The point at which the trading day changes and financing is applied', 'The close of the New York stock exchange', 'The daily economic release window', 'The start of the Asian session'],
    'A', 'It is the daily boundary. Positions held through it are financed, and the trading date changes.'),
  q(12, 'Risk', 'What does a position’s "size" determine?',
    ['How much each unit of price movement is worth', 'Which direction the trade is in', 'How long the trade stays open', 'The spread you pay'],
    'A', 'Size sets what a pip or a point is worth. Direction, duration and spread are separate things.'),
  q(13, 'Risk', 'If a trade risks $100 and targets $300, the reward-to-risk ratio is…',
    ['3 to 1', '1 to 3', '300 to 1', 'It cannot be expressed as a ratio'],
    'A', 'Reward divided by risk: 300 ÷ 100 is 3 to 1. It says nothing about how often the trade wins.'),
  q(14, 'Risk', 'What is drawdown?',
    ['The fall from a peak in account value to the low that follows it', 'The total of every losing trade', 'The margin a broker requires', 'The fee for holding overnight'],
    'A', 'It is measured peak to trough, which is why it can be large even on an account that is up overall.'),
  q(15, 'Risk', 'Profit factor is calculated as…',
    ['Gross profit divided by gross loss', 'Net profit divided by trades', 'Wins divided by losses', 'Realized P/L divided by deposits'],
    'A', 'Gross profit over gross loss. Above 1 means the winners outweigh the losers in money, not in count.'),
];
