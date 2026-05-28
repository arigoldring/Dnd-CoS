import barovia_map from "../assets/Maps/Spoiler Free Map.png";
export function Maps() {
  return (
    <div>
      <p>Maps</p>
      <img
        src={barovia_map}
        alt="map of barovia"
        style={{ width: "800px", height: "auto" }}
      />
    </div>
  );
}
