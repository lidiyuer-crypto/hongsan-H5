// Server-side Card class (pure data, no display getters needed)
export class Card {
  suit: number;      // 0=diamond, 1=club, 2=heart, 3=spade
  rankValue: number; // 4-16 (16=Red3)

  constructor(suit: number, rankValue: number) {
    this.suit = suit;
    this.rankValue = rankValue;
  }

  get isRed3(): boolean {
    return this.rankValue === 16 && (this.suit === 0 || this.suit === 2);
  }

  get isH4(): boolean {
    return this.suit === 2 && this.rankValue === 4;
  }

  get color(): 'red' | 'black' {
    return (this.suit === 0 || this.suit === 2) ? 'red' : 'black';
  }

  get suitChar(): string {
    return ['♦', '♣', '♥', '♠'][this.suit];
  }

  get displayRank(): string {
    const RANK_DISPLAY: Record<number, string> = {
      4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'3'
    };
    return RANK_DISPLAY[this.rankValue] || String(this.rankValue);
  }

  // For JSON serialization (client needs display info)
  toJSON() {
    return {
      suit: this.suit,
      rankValue: this.rankValue,
      displayRank: this.displayRank,
      suitChar: this.suitChar,
      color: this.color,
      isRed3: this.isRed3,
      isH4: this.isH4,
    };
  }
}

export type CardData = ReturnType<Card['toJSON']>;
