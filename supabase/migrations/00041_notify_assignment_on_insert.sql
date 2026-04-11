-- Fire assignment notification when a task is created with an assignee
CREATE OR REPLACE FUNCTION notify_on_task_assignment_insert()
RETURNS trigger AS $$
BEGIN
  IF new.assignee IS NOT NULL AND new.assignee != new.created_by THEN
    INSERT INTO notifications (user_id, type, task_id, message)
    VALUES (new.assignee, 'assignment', new.id,
            'You were assigned to "' || new.title || '"');
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_task_assignment_insert
  AFTER INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_on_task_assignment_insert();
