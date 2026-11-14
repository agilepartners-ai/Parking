-- People and roles: the console needs to SHOW who has which role, not only change one by email.

-- Operator admins see the staff of their own operator. A platform admin sees every staff member.
create or replace function operator_staff() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  return coalesce((select jsonb_agg(jsonb_build_object(
             'id', u.id, 'email', u.email, 'full_name', u.full_name, 'role', u.role,
             'operator_id', u.operator_id, 'operator_name', o.name, 'is_me', u.id = v_me.id)
           order by case u.role when 'platform_admin' then 0 when 'operator_admin' then 1 else 2 end, u.full_name)
         from app_user u left join operator o on o.id = u.operator_id
         where u.deleted_at is null and u.role <> 'driver'
           and (v_me.role = 'platform_admin' or u.operator_id = v_me.operator_id)), '[]'::jsonb);
end $$;

-- One call for the role dropdown. Who may set what:
--   operator admin  -> driver or officer, for people of their own operator (or a plain driver they are adding)
--   platform admin  -> driver, officer or operator_admin, for any operator
-- Nobody can change their own role, and platform_admin is never granted from the console.
create or replace function set_staff_role(p_email text, p_role user_role, p_operator_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_me app_user; v_target app_user; v_op uuid;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  select * into v_target from app_user where email = lower(btrim(p_email)) and deleted_at is null;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if v_target.id = v_me.id then raise exception 'cannot_change_own_role' using errcode = 'P0001'; end if;
  if v_target.role = 'platform_admin' or p_role = 'platform_admin' then raise exception 'forbidden' using errcode = 'P0001'; end if;

  if v_me.role = 'operator_admin' then
    if p_role not in ('driver', 'officer') or v_target.role = 'operator_admin' then
      raise exception 'forbidden' using errcode = 'P0001';   -- admins are appointed and removed by the platform admin only
    end if;
    -- only their own people, or a driver who belongs to nobody yet
    if not (v_target.operator_id = v_me.operator_id or (v_target.role = 'driver' and v_target.operator_id is null)) then
      raise exception 'user_not_found' using errcode = 'P0001';
    end if;
    v_op := v_me.operator_id;
  else
    v_op := coalesce(p_operator_id, v_target.operator_id, v_me.operator_id);
    if p_role <> 'driver' and (v_op is null or not exists (select 1 from operator where id = v_op)) then
      raise exception 'operator_required' using errcode = 'P0001';
    end if;
  end if;

  update app_user set role = p_role, operator_id = case when p_role = 'driver' then null else v_op end
   where id = v_target.id;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'app_user', v_target.email, 'set_role', jsonb_build_object('role', p_role, 'operator_id', v_op));
end $$;

revoke execute on function operator_staff() from public, anon;
grant  execute on function operator_staff() to authenticated;
revoke execute on function set_staff_role(text, user_role, uuid) from public, anon;
grant  execute on function set_staff_role(text, user_role, uuid) to authenticated;
