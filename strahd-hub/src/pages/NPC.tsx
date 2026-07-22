interface NPC {
  id: string;
  name: string;
  description: string;
  location: string;
  is_revealed: boolean;
  dm_notes?: string;
  portrait?: string;
}
const NPCS: NPC[] = [
  {
    id: "strahd",
    name: "Strahd von Zarovich",
    description:
      "The vampire lord who rules Barovia, ancient and cursed to relive his tragic love story forever.",
    location: "Castle Ravenloft",
    is_revealed: true,
    dm_notes: "",
    portrait: "/portraits/strahd.png",
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
          {npc.portrait && <img src={npc.portrait} alt={npc.name} />}
        </div>
      ))}
    </div>
  );
}
