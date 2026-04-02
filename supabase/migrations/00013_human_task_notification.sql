-- Allow 'human_task' as a notification type
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('status_change', 'mention', 'assignment', 'human_task'));
