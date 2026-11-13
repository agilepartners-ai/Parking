/** Server error codes (raised by the SQL functions) -> messages a driver can act on. */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  forbidden: 'Your account is not allowed to do that.',
  vehicle_not_found: 'That vehicle was not found. Add it under Vehicles first.',
  no_parking_area: 'There is no parking area at this location. Move into a marked area, or pick a test spot in Account.',
  no_rate_plan: 'This area has no rates set up yet.',
  session_already_active: 'This vehicle already has a running parking session.',
  session_not_active: 'That parking session has already ended.',
  session_not_found: 'Parking session not found.',
  location_too_inaccurate: 'Your phone is not sure where you are yet. Wait a few seconds in the open, then try again.',
  citation_not_found: 'That ticket was not found.',
  citation_not_payable: 'That ticket is already paid or was cancelled.',
  invalid_location: 'Your location is not available yet. Try again in a moment.',
  invalid_plate: 'Enter a valid plate (2 to 10 letters or numbers).',
  invalid_fine: 'Enter a fine amount between $1 and $500.',
  reason_required: 'Choose a reason for the citation.',
  end_active_session_first: 'End your active parking session before deleting your account.',
  invalid_name: 'Enter your name (up to 80 characters).',
  user_not_found: 'User not found.',
};

export class ApiError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? code);
  }
}

/** Turn a Supabase/Postgres error into an ApiError with a friendly message. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const raw = (e as { message?: string })?.message ?? String(e);
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return new ApiError(code);
  if (/duplicate key.*vehicle_unique_plate/.test(raw)) return new ApiError('duplicate_vehicle', 'You already added this plate.');
  if (/Network request failed|fetch failed|network/i.test(raw)) return new ApiError('network', 'No connection. Check your internet and try again.');
  if (/Invalid login credentials/i.test(raw)) return new ApiError('bad_login', 'Wrong email or password.');
  if (/already registered|already been registered/i.test(raw)) return new ApiError('exists', 'That email already has an account. Sign in instead.');
  if (/Password should be at least/i.test(raw)) return new ApiError('weak_password', 'Password must be at least 6 characters.');
  if (/rate limit/i.test(raw)) return new ApiError('rate_limit', 'Too many attempts. Wait a minute and try again.');
  return new ApiError('unknown', raw);
}

export const errorMessage = (e: unknown) => toApiError(e).message;
