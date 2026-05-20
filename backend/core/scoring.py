# Round-aware scoring per official תקנון המשחק.
# Each round maps to (direction_pts, exact_pts).
# "difference" (same goal margin, different score) awards direction_pts — the
# rules define only two tiers: exact score and correct direction.
ROUND_POINTS: dict[str, tuple[int, int]] = {
    "group": (1,  3),
    "r32":   (2,  5),
    "r16":   (2,  5),
    "qf":    (4,  8),
    "sf":    (5, 10),
    "3rd":   (5, 10),
    "final": (8, 15),
}

TOURNAMENT_WINNER_PTS  = 12
TOURNAMENT_SCORER_PTS  = 12


def compute_outcome(
    predicted_home: int,
    predicted_away: int,
    actual_home:    int,
    actual_away:    int,
    round_code:     str = "group",
) -> tuple[str, int]:
    direction_pts, exact_pts = ROUND_POINTS.get(round_code, ROUND_POINTS["group"])

    if predicted_home == actual_home and predicted_away == actual_away:
        return "exact", exact_pts

    predicted_diff = predicted_home - predicted_away
    actual_diff    = actual_home    - actual_away
    if predicted_diff == actual_diff:
        return "difference", direction_pts

    def sign(n: int) -> int:
        return 1 if n > 0 else (-1 if n < 0 else 0)

    if sign(predicted_diff) == sign(actual_diff):
        return "outcome", direction_pts

    return "wrong", 0
