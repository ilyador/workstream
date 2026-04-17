-- Position columns need to support fractional values for O(1) midpoint
-- insertion during drag-and-drop reordering (e.g. inserting between
-- positions 2 and 3 yields 2.5 instead of renumbering every row).

ALTER TABLE tasks ALTER COLUMN position TYPE real;
ALTER TABLE workstreams ALTER COLUMN position TYPE real;
ALTER TABLE flows ALTER COLUMN position TYPE real;
