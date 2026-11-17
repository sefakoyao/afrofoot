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
psql -v ON_ERROR_STOP=1 -d $DB -f tests/80_social_sign_in.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/90_events.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/95_phone_sign_up.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/96_invoice_consents.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/97_auto_contracts.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/98_amateur_contract.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/99_news_import.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/A1_federation_sync.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/A2_squad_consent.sql
