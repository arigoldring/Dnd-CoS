import { Link } from "react-router-dom";

export function Home() {
  return (
    <div>
      <h1>Welcome to Curse of Strahd</h1>
      <Link to="/Shop">
        <button>Shop</button>
      </Link>
      <Link to="/Maps">
        <button>Maps</button>
      </Link>
      <Link to="/Spells">
        <button>Spells</button>
      </Link>
      <Link to="/NPC">
        <button>NPCs</button>
      </Link>
      <Link to="/Recaps">
        <button>Recaps</button>
      </Link>
    </div>
  );
}
