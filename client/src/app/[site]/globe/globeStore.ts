import { create } from "zustand";
import { MapView } from "./components/ModeSelector";
import { IS_CLOUD } from "../../../lib/const";

interface GlobeStore {
  mapView: MapView;
  setMapView: (view: MapView) => void;
  mapMode: "3D" | "2D";
  setMapMode: (mode: "3D" | "2D") => void;
}

export const useGlobeStore = create<GlobeStore>(set => ({
  mapView: "timeline",
  setMapView: view => set({ mapView: view }),
  mapMode: IS_CLOUD ? "3D" : "2D",
  setMapMode: mode => set({ mapMode: mode }),
}));
