import { Outlet, Link } from "react-router-dom";

export function Layout() {
  return (
    <div>
      <Link to="/">Home</Link>
      <Link to="/Shop">Shop</Link>
      <Link to="/Maps">Maps</Link>
      <Link to="/Spells">Spells</Link>
      <Outlet />
    </div>
  );
}
