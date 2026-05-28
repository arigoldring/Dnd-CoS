import { Link } from "react-router-dom";

export function Home() {
  return (
    <div>
      <h1>Welcome to Curse of Strahd</h1>
      <Link to="/Shop">
        <button>Shop</button>
        <Link to="/Maps">
          <button>Maps</button>
        </Link>
      </Link>
    </div>
  );
}
