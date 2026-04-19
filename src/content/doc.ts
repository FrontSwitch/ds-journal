export type DocNode =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'item'; text: string }
  | { type: 'dl'; term: string; def: string }
