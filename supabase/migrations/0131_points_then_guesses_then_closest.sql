-- Ties for first, broken by how you got there.
--
-- The pay tables are coarse on purpose - round two has seven possible scores,
-- round one nine - so with two or three dozen players the top score is shared
-- most days. Points alone cannot rank a board this small.
--
-- Points, then fewest guesses, then closest. Two players on the same score are
-- separated first by how much searching it took, and then, if they searched the
-- same amount, by how near they were on the rounds they lost. Both come out of
-- rows that already exist; nothing new is written when a day is played.
--
-- Time was the other candidate and is deliberately not here. The clock on the
-- game screen is worth watching and worth nothing as a rank: it turns a game
-- about thinking into a race, and it punishes whoever plays on a train.
--
-- Dropping it also drops the subquery that computed it - a per-round min and
-- max over every guess of every game in the window, which was the most
-- expensive thing in this function and now buys nothing.
--
-- While here: 0122 moved the boards to count from the points epoch and reached
-- alltime_leaderboard and the season board, but not this one. The Rank tab's
-- all-time window was still counting days from before the reset, so the same
-- player had two different all-time totals depending on which screen asked.

begin;

/** The dates a board covers. Nothing before the epoch counts on any of them. */
create or replace function public.board_range(p_board text, p_uid uuid)
returns table (lo date, hi date)
language sql
stable
as $$
  select
    case p_board
      when 'today'  then public.current_puzzle_date(p_uid)
      when 'season' then greatest(public.current_season(p_uid), public.points_epoch())
      else public.points_epoch()
    end,
    case p_board
      when 'today'  then public.current_puzzle_date(p_uid)
      when 'season' then (public.current_season(p_uid) + interval '1 month' - interval '1 day')::date
      else '9999-12-31'::date
    end;
$$;

create or replace function public.board_standings(
  p_board   text,
  p_friends boolean,
  p_uid     uuid
)
returns table (
  user_id uuid,
  points  integer,
  avg_off integer,
  days    integer,
  rank    bigint
)
language sql
stable
as $$
  with bounds as (select * from public.board_range(p_board, p_uid)),
  played as (
    select
      g.user_id,
      g.total_score,
      g.finished_at,
      coalesce((
        select sum(abs(gu.guess - s.answer))
        from public.guesses gu
        join public.round_results rr on rr.game_id = g.id and rr.round = gu.round
        join public.puzzle_round_secrets s
             on s.puzzle_date = g.puzzle_date and s.round = rr.source_round
        where gu.game_id = g.id
      ), 0)::bigint as distance,
      (select count(*) from public.guesses gu where gu.game_id = g.id)::bigint as guesses
    from public.games g, bounds b
    where g.puzzle_date between b.lo and b.hi
      and g.status in ('complete', 'eliminated')
      and (not p_friends or exists (
        select 1 from public.my_circle(p_uid) c where c.user_id = g.user_id))
  ),
  totals as (
    select
      p.user_id,
      sum(p.total_score)::int as points,
      count(*)::int           as days,
      sum(p.guesses)::bigint  as guesses,
      max(p.finished_at)      as last_at,
      case when sum(p.guesses) > 0
           then round(sum(p.distance)::numeric / sum(p.guesses))::int else 0 end as avg_off
    from played p
    group by p.user_id
  )
  select
    t.user_id,
    t.points,
    t.avg_off,
    t.days,
    -- Points, then fewest guesses, then closest. last_at stays on the end so
    -- two players who match on all three still rank in a stable order rather
    -- than swapping places between two loads of the same board.
    row_number() over (
      order by t.points desc, t.guesses asc, t.avg_off asc, t.last_at asc
    )
  from totals t;
$$;

commit;
