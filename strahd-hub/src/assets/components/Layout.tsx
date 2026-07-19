import { Outlet, Link } from "react-router-dom";
import { signOut } from "../../services/auth";

export function Layout() {
  return (
    <div>
      <Link to="/">Home</Link>
      <Link to="/Shop">Shop</Link>
      <Link to="/Maps">Maps</Link>
      <Link to="/Spells">Spells</Link>
      <button onClick={() => signOut()}>Sign out</button>
      <Outlet />
    </div>
  );
}
