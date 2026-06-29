-- One-time: for rows that still have FT semantics (nickname = legal/real name, first/last = pseudonym),
-- swap into LDP semantics: first_name/last_name = split(legal from nickname), nickname = old pseudonym (first + middle + last).
-- Only WHERE nickname IS NOT NULL AND trim(nickname) <> ''.
-- Do not re-run after swap (second run would corrupt data).
-- Split rule: first word -> first_name, remainder -> last_name; single word -> last_name ''.

UPDATE employees AS e
SET
  first_name = v.new_first,
  last_name = v.new_last,
  nickname = NULLIF(trim(v.new_nick), ''),
  updated_at = NOW()
FROM (
  SELECT
    id,
    CASE
      WHEN strpos(trim(nickname), ' ') = 0 THEN trim(nickname)
      ELSE trim(substring(trim(nickname) from 1 for strpos(trim(nickname), ' ') - 1))
    END AS new_first,
    CASE
      WHEN strpos(trim(nickname), ' ') = 0 THEN ''
      ELSE trim(substring(trim(nickname) from strpos(trim(nickname), ' ') + 1))
    END AS new_last,
    trim(regexp_replace(
      concat_ws(
        ' ',
        NULLIF(trim(first_name), ''),
        NULLIF(trim(middle_name), ''),
        NULLIF(trim(last_name), '')
      ),
      '\s+',
      ' ',
      'g'
    )) AS new_nick
  FROM employees
  WHERE nickname IS NOT NULL
    AND trim(nickname) <> ''
) AS v
WHERE e.id = v.id
  AND trim(v.new_nick) <> '';
