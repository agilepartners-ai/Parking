-- The app needs the shape of the area a session was started in even after the driver has moved away
-- (to tell them "you left the area"), so fetch one area by id.
create or replace function get_area(p_area_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _me();
  return _area_json(p_area_id);
end $$;

revoke execute on function get_area(uuid) from public, anon;
grant execute on function get_area(uuid) to authenticated;
