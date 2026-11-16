-- Capacity changes are versioned like hours and publishing (see 20261116000009_capacity.sql).
alter table parking_area_version drop constraint if exists parking_area_version_action_check;
alter table parking_area_version add constraint parking_area_version_action_check
  check (action in ('save', 'publish', 'unpublish', 'archive', 'hours', 'capacity'));
