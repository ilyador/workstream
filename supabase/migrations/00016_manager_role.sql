-- Add 'manager' to project_members role constraint
alter table project_members drop constraint if exists project_members_role_check;
alter table project_members add constraint project_members_role_check check (role in ('admin', 'dev', 'manager'));
