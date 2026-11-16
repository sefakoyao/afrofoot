-- supabase/content/news_import_old_site.sql: the 37 articles from the old website load, are published with their dates,
-- respect the table's checks, and running the file again changes nothing. Uses the t.* helpers of 10_rls.sql.
begin;
\i content/news_import_old_site.sql
select t.check('37 articles imported', (select count(*) from news_posts where cover_path like '/news/%' or slug = 'competition-studio-finnish-cup') = 37);
select t.check('all published with their original dates (2021–2026)', (select bool_and(status = 'published' and published_at between '2021-01-01' and '2026-12-31') from news_posts where slug in (select slug from news_posts where cover_path like '/news/%')));
select t.check('excerpts fit (≤ 300 characters)', (select bool_and(excerpt is null or char_length(excerpt) <= 300) from news_posts));
select t.check('no HTML kept in the text', not exists (select 1 from news_posts where body_md ~ '<(div|span|img|iframe|script|p)[ >]'));
select t.check('pictures point to the site itself', not exists (select 1 from news_posts where body_md ~ '!\[[^]]*\]\((?!/news/)'));
select t.check('emoji kept as text', exists (select 1 from news_posts where slug = 'omar-jarra-true-legend' and body_md like '💚💛 Player Spotlight%'));
create temp table n_before as select slug, md5(body_md) h from news_posts;
\i content/news_import_old_site.sql
select t.check('running it again changes nothing', (select count(*) from news_posts) = (select count(*) from n_before)
  and not exists (select 1 from news_posts p join n_before b using (slug) where md5(p.body_md) <> b.h));
select t.anon();
select t.check('visitors see the imported articles', (select count(*) from news_posts where slug = 'omar-jarra-true-legend') = 1);
rollback;
