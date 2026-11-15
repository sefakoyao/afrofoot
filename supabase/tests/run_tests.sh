#!/bin/sh
# Usage: PGHOST=/tmp PGPORT=5544 PGUSER=postgres sh supabase/tests/run_tests.sh
set -e
cd "$(dirname "$0")/.."
DB=afrofoot_test
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/00_stub_supabase.sql
for f in migrations/*.sql; do echo "migrate $f"; psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d $DB -f seed.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/10_rls.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/20_invoices.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/30_conduct.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/40_event_replies.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/50_contracts.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/60_match_day.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/70_lineup_board.sql
