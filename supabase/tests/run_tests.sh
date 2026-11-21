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
psql -v ON_ERROR_STOP=1 -d $DB -f tests/A3_squad_palloliitto.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/A4_top_scorers.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/A5_signin_help.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/A6_player_coach.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/A7_requests_inbox.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/A8_match_details.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/A9_email_reminders.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/B1_football_quiz.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/B2_quiz_more.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/B3_signin_log.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/B4_contract_signatory.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/B5_past_due.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/B6_finance.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/B7_balance_invoices.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/B8_partial_payments.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/B9_shirt_numbers.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/C1_contact_robot_nonce.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/C2_shirt_set.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/C3_invoice_schedule.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/C4_opponents.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/C5_event_tasks.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/C6_season_invoices.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/C7_content_assistant.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/C8_merge_accounts.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/C9_coach_requests.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/D1_duplicate_accounts.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/D2_minor_contracts.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/D3_reply_counts.sql
