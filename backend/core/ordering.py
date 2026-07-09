"""
Canonical match ordering — used by every endpoint that returns a list of
matches, so the schedule sorts identically on the matches page, match detail
page, league predictions, and admin schedule views.

Sorting by scheduled_at alone leaves ties (same kickoff time — including two
rows that are actually duplicates of the same fixture) in whatever order
Postgres happens to return them, which can vary between requests. Appending
`id` makes the order fully deterministic.
"""
from models.match import Match

MATCH_ORDER_BY = (Match.scheduled_at, Match.id)
