import type { Citation, NearbyVehicle, NewVehicle, ParkingArea, ParkingSession, PlateCheck, Role, Vehicle } from '@parkpay/shared';

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
  operator_id: string | null;
}

export interface StartInput {
  vehicleId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  key: string;
  /** Optional planned stay in minutes. */
  plannedMinutes?: number | null;
}

export interface CitationInput {
  plate: string;
  region?: string | null;
  reason: string;
  fineCents: number;
  lat?: number | null;
  lng?: number | null;
}

/** Everything the screens need from a backend. Two implementations: live (Supabase) and demo (on-device). */
export interface Api {
  readonly mode: 'live' | 'demo';

  // auth
  restore(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<Profile>;
  /** Returns null when the backend wants the email confirmed first. */
  signUp(email: string, password: string, fullName: string): Promise<Profile | null>;
  signOut(): Promise<void>;
  profile(): Promise<Profile>;
  updateName(name: string): Promise<void>;
  deleteAccount(): Promise<void>;

  // vehicles
  vehicles(): Promise<Vehicle[]>;
  addVehicle(v: NewVehicle): Promise<Vehicle>;
  removeVehicle(id: string): Promise<void>;
  setDefaultVehicle(id: string): Promise<void>;

  // parking
  areas(lat: number, lng: number): Promise<ParkingArea[]>;
  area(id: string): Promise<ParkingArea | null>;
  startSession(i: StartInput): Promise<ParkingSession>;
  endSession(id: string, lat?: number | null, lng?: number | null): Promise<ParkingSession>;
  activeSession(): Promise<ParkingSession | null>;
  sessions(): Promise<ParkingSession[]>;
  ping(sessionId: string, lat: number, lng: number, accuracy?: number | null, speed?: number | null): Promise<void>;

  // officer
  officerCheck(plate: string, lat?: number | null, lng?: number | null): Promise<PlateCheck>;
  officerNearby(lat: number, lng: number, radius: number): Promise<NearbyVehicle[]>;
  officerCite(i: CitationInput): Promise<Citation>;
  officerCitations(): Promise<Citation[]>;

  /** Demo only: pretend to be a different kind of user. */
  demoSetRole?(role: Role): Promise<Profile>;
}
