import { Outlet, Link } from "react-router-dom";
import { signOut } from "../../services/auth";
import { NamePrompt } from "./NamePrompt";
import { useAuth } from "../../services/AuthContext";
import { useState } from "react";

export function Layout() {
  const { profile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div>
      <Link to="/">Home</Link>
      <Link to="/Shop">Shop</Link>
      <Link to="/Maps">Maps</Link>
      <Link to="/Spells">Spells</Link>
      <button onClick={() => signOut()}>Sign out</button>
      {!isEditing ? (
        <span>
          {profile?.display_name}
          <button onClick={() => setIsEditing(true)}>Edit</button>
        </span>
      ) : (
        <NamePrompt
          initialName={profile?.display_name ?? ""}
          heading="Name:"
          onSuccess={() => setIsEditing(false)}
        />
      )}
      <Outlet />
    </div>
  );
}
