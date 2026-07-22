import { useAuth } from "../services/AuthContext";
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
    dm_notes: "asjfdhasfp",
    portrait: "/portraits/strahd.png",
  },
  {
    id: "rahadin",
    name: "Rahadin",
    description:
      "Strahd's Dusk Elf chamberlain and executioner, fiercely loyal and centuries old.",
    location: "Castle Ravenloft",
    is_revealed: false,
  },
];
export function Npcs() {
  const { profile, loading } = useAuth();
  const isDm = profile?.role === "dm";
  if (loading) return <p>Loading...</p>;
  const visibleNpcs = isDm ? NPCS : NPCS.filter((npc) => npc.is_revealed);

  return (
    <div>
      {visibleNpcs.map((npc) => (
        <div key={npc.id}>
          <h3>{npc.name}</h3>
          <p>{npc.description}</p>
          <p>{npc.location}</p>
          {npc.portrait && <img src={npc.portrait} alt={npc.name} />}
          {isDm && npc.dm_notes && <p>DM notes: {npc.dm_notes}</p>}
        </div>
      ))}
    </div>
  );
}
