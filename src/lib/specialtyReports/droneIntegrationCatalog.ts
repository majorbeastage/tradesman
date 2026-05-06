/**
 * Known drone / flight-plan platforms (industry awareness + future API integrations).
 * Nothing here calls external APIs yet — this backs UI copy and a stable id list for later webhooks.
 */
export type DroneProviderId =
  | "dji_flighthub_2"
  | "dji_fly"
  | "autel_skydock"
  | "skydio_cloud"
  | "parrot_flightpro"
  | "wingtra_pilot"
  | "ugcs"
  | "dronedeploy"
  | "pix4dcapture"
  | "pix4dengine"
  | "sitescan_esri"
  | "propeller"
  | "droneharmony"
  | "litchi"
  | "other_partner"

export type DroneProviderCatalogEntry = {
  id: DroneProviderId
  name: string
  notes: string
}

export const DRONE_PROVIDER_CATALOG: DroneProviderCatalogEntry[] = [
  { id: "dji_flighthub_2", name: "DJI FlightHub 2 / Fleet ops", notes: "Enterprise fleet visibility; candidate for mission → asset sync." },
  { id: "dji_fly", name: "DJI Fly / consumer ops", notes: "Often paired with manual export; consider inbox-ing shared album links first." },
  { id: "autel_skydock", name: "Autel SkyDock / ecosystem", notes: "Dock + drone pairing; watch for OEM cloud APIs." },
  { id: "skydio_cloud", name: "Skydio Cloud", notes: "Strong for programmatic media when API keys are available." },
  { id: "parrot_flightpro", name: "Parrot / senseFly stack", notes: "Mapping workflows; export orthos / flight logs." },
  { id: "wingtra_pilot", name: "WingtraPilot / WingtraHub", notes: "VTOL mapping; typical handoff is processed outputs + raw images." },
  { id: "ugcs", name: "UgCS", notes: "Mission planning; possible bridge via flight log + media bundles." },
  { id: "dronedeploy", name: "DroneDeploy", notes: "Maps & progress photos; partnership / API tier dependent." },
  { id: "pix4dcapture", name: "PIX4Dcapture / PIX4Dcloud", notes: "Photogrammetry pipelines; good fit for ortho + point cloud handoff." },
  { id: "pix4dengine", name: "PIX4Dengine (API)", notes: "Headless processing API — useful if we host processing ourselves." },
  { id: "sitescan_esri", name: "ArcGIS Site Scan / Esri Drone2Map", notes: "Enterprise GIS shops; exports often land in AGOL." },
  { id: "propeller", name: "Propeller Aero", notes: "Earthworks / progress reporting; media tied to surfaces." },
  { id: "droneharmony", name: "Drone Harmony", notes: "Facade / complex facade scans in commercial workflows." },
  { id: "litchi", name: "Litchi (third-party)", notes: "Waypoint automation on DJI; usually manual media retrieval unless scripted." },
  { id: "other_partner", name: "Other / charter partnership", notes: "Placeholder for a white-label or OEM route we negotiate later." },
]
