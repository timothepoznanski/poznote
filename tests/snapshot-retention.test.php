<?php
require_once dirname(__DIR__) . '/src/config.php';

// Issue #1365: the number of safety snapshots kept before an AI/MCP edit was a
// constant. An instance whose MCP server edits a lot rolls through 20 in an
// afternoon, and one that never uses AI has no reason to keep 20 copies of
// every note, so it is a setting now, with the same guards as the automatic
// snapshot count.
//
// The reading of the setting itself needs a database; what is worth pinning
// down without one is the clamp, because the failure mode of a bad value is
// not "the wrong number of snapshots" but "no snapshots at all".

test('a count inside its range is used as it stands', function () {
    assertSame(7, poznoteClampSnapshotsKeepCount('7', 1, 200, 20));
    assertSame(1, poznoteClampSnapshotsKeepCount(1, 1, 200, 20));
    assertSame(200, poznoteClampSnapshotsKeepCount(200, 1, 200, 20));
});

test('zero never reaches the purge, which would delete every snapshot', function () {
    assertSame(20, poznoteClampSnapshotsKeepCount('0', 1, 200, 20));
    assertSame(20, poznoteClampSnapshotsKeepCount('', 1, 200, 20));
    assertSame(20, poznoteClampSnapshotsKeepCount(null, 1, 200, 20));
    assertSame(20, poznoteClampSnapshotsKeepCount('not a number', 1, 200, 20));
});

test('a count outside the range falls back to the default', function () {
    assertSame(20, poznoteClampSnapshotsKeepCount('-5', 1, 200, 20));
    assertSame(20, poznoteClampSnapshotsKeepCount('201', 1, 200, 20));
    assertSame(3, poznoteClampSnapshotsKeepCount('9999', 1, 30, 3));
});

test('the safety snapshots have their own, wider range', function () {
    // 20 is already the default, so the setting is only useful if it goes
    // well above the automatic maximum of 30.
    assertTrue(POZNOTE_SNAPSHOTS_SAFETY_MAX_COUNT > POZNOTE_SNAPSHOTS_MAX_COUNT);
    assertSame(20, POZNOTE_SNAPSHOTS_SAFETY_DEFAULT_COUNT);
    assertTrue(POZNOTE_SNAPSHOTS_SAFETY_DEFAULT_COUNT >= POZNOTE_SNAPSHOTS_SAFETY_MIN_COUNT);
    assertTrue(POZNOTE_SNAPSHOTS_SAFETY_DEFAULT_COUNT <= POZNOTE_SNAPSHOTS_SAFETY_MAX_COUNT);
});

test('both counts read their own setting and neither can return zero', function () {
    // No database here, so getSetting() serves the defaults: what this pins
    // down is that each helper is wired to its own constants.
    assertSame(POZNOTE_SNAPSHOTS_DEFAULT_COUNT, getSnapshotsKeepCount());
    assertSame(POZNOTE_SNAPSHOTS_SAFETY_DEFAULT_COUNT, getSafetySnapshotsKeepCount());
    assertTrue(getSnapshotsKeepCount() >= 1);
    assertTrue(getSafetySnapshotsKeepCount() >= 1);
});
