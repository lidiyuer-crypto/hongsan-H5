import { RANK_DISPLAY, SUITS } from './constants';

export default class Card {
  constructor(suit, rankValue) {
    this.suit = suit;
    this.rankValue = rankValue;
    this.isSelected = false;
  }
  get displayRank() { return RANK_DISPLAY[this.rankValue]; }
  get color() { return (this.suit === 0 || this.suit === 2) ? 'red' : 'black'; }
  get suitChar() { return SUITS[this.suit]; }
  get isH4() { return this.suit === 2 && this.rankValue === 4; }
  get isRed3() { return this.rankValue === 16 && (this.suit === 0 || this.suit === 2); }
}
