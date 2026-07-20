interface NPC {
  name: string;
  description: string;
  location: string;
}
const NPCS: NPC[] = [
  {
    name: "Strahd von Zarovich",
    description:
      "The vampire lord who rules Barovia, ancient and cursed to relive his tragic love story forever.",
    location: "Castle Ravenloft",
  },
  {
    name: "Ismark Kolyanovich",
    description:
      "Burgomaster's son of Vallaki's neighboring village, trying to protect his sister Ireena from Strahd.",
    location: "Village of Barovia",
  },
  {
    name: "Ireena Kolyana",
    description:
      "Strahd's reincarnated love interest, hunted by the vampire and in need of protection.",
    location: "Village of Barovia",
  },
  {
    name: "Madam Eva",
    description:
      "Fortune teller of the Vistani who reads the Tarokka deck to reveal the locations of the Sunsword, Holy Symbol, and Tome of Strahd.",
    location: "Tser Pool Encampment",
  },
  {
    name: "Rudolph van Richten",
    description:
      "Famed monster hunter who may aid or share knowledge with adventurers battling Strahd, if they can find him.",
    location: "Village of Krezk",
  },
];
export function Npcs() {
  return (
    <div>
      {NPCS.map((npc) => (
        <div key={npc.name}>
          <h3>{npc.name}</h3>
          <p>{npc.description}</p>
          <p>{npc.location}</p>
        </div>
      ))}
    </div>
  );
}
