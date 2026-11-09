#!/usr/bin/env bash
# Assertion helpers for tests/test-*.sh. Sourced, not executed.

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

assert_eq() {  # assert_eq <actual> <expected> [message]
    [ "$1" = "$2" ] || fail "${3:-expected '$2', got '$1'}"
}

assert_between() {  # assert_between <value> <min> <max>
    [ "$1" -ge "$2" ] && [ "$1" -le "$3" ] || fail "value $1 not in [$2, $3]"
}

assert_text_contains() {  # assert_text_contains <text> <needle>
    [[ "$1" == *"$2"* ]] || fail "output does not contain: $2"
}

assert_contains() {  # assert_contains <file> <needle>
    grep -Fq -- "$2" "$1" 2>/dev/null || fail "$1 does not contain: $2"
}

assert_not_contains() {  # assert_not_contains <file> <needle>
    if grep -Fq -- "$2" "$1" 2>/dev/null; then fail "$1 unexpectedly contains: $2"; fi
}

count_matches() {  # count_matches <file> <needle>: prints 0 when the file is missing
    local n
    n="$(grep -Fc -- "$2" "$1" 2>/dev/null)" || n=0
    echo "$n"
}

pass() { echo "PASS: $*"; }
