-- The catalogue is for technical manufacturing roles. Safety and EHS roles are
-- out of scope and are removed. Their links to skills, factories and goals go
-- with them; the skills themselves stay (lockout/tagout and the like are part
-- of technical paths). Safe to run again.
DELETE FROM occupations
WHERE title IN ('Safety Manager', 'Pad Safety Coordinator', 'Range Safety Operator');
