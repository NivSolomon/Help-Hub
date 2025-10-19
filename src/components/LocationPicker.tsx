// src/components/LocationPicker.tsx
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type LatLng = { lat: number; lng: number };

type Props = {
  initialCenter: LatLng;
  initialSelection?: LatLng | null;
  heightClass?: string;          // e.g. "h-72"
  // Fires whenever the user picks/moves the marker
  onChange: (location: LatLng) => void;
};

// simple blue pin
const pin = new L.Icon({
  iconUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 48' width='32' height='48'>
        <path d='M16 0C8.3 0 2 6.3 2 14c0 9.7 12 22.8 13 23.9a1.4 1.4 0 002 0C18 36.8 30 23.7 30 14 30 6.3 23.7 0 16 0z' fill='#2563eb'/>
        <circle cx='16' cy='14' r='6' fill='white'/>
      </svg>`
    ),
  iconSize: [24, 36],
  iconAnchor: [12, 36],
});

function ClickAndDrag({
  value,
  setValue,
  onChange,
}: {
  value: LatLng | null;
  setValue: (v: LatLng) => void;
  onChange: (v: LatLng) => void;
}) {
  useMapEvents({
    click(e) {
      const v = { lat: e.latlng.lat, lng: e.latlng.lng };
      setValue(v);
      onChange(v);
    },
  });
  return null;
}

export default function LocationPicker({
  initialCenter,
  initialSelection = null,
  heightClass = "h-72",
  onChange,
}: Props) {
  const [value, setValue] = useState<LatLng | null>(initialSelection);

  // keep external updates in sync (when modal re-opens, etc.)
  useEffect(() => setValue(initialSelection ?? null), [initialSelection]);

  return (
    <div className={heightClass} style={{ width: "100%" }}>
      <MapContainer
        center={value ?? initialCenter}
        zoom={14}
        style={{ width: "100%", height: "100%", borderRadius: "0.75rem" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickAndDrag value={value} setValue={setValue} onChange={onChange} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={pin}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const m = e.target as L.Marker;
                const ll = m.getLatLng();
                const v = { lat: ll.lat, lng: ll.lng };
                setValue(v);
                onChange(v);
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}

// local React hooks
import { useEffect, useState } from "react";
