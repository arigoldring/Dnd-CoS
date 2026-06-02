export interface Spell {
    name: string
    school: string
    description: string
    duration: string
    tags: string[]
}

export const SPELLS: Spell[] = [
{ name: "magic missle", school: "evocation", description: "You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.", duration: "instant", tags: ["evocation"]
},
{name: "shield", school: "aburation", description: "gain +5 to ac until next turn", duration: "1 turn", tags: ["a spell"]}
] 