## SQL Reference

Short, copy-pasteable queries that mirror what the UI expects from Supabase. All queries assume you are connected to the `public` schema.

### 1. Monthly metric trend (per org + metric)

```sql
select
  month,
  year,
  round(avg(actual), 2) as avg_actual,
  round(avg(goal), 2) as avg_goal,
  round(avg(ptg), 2) as avg_ptg,
  count(*) as data_points
from monthly_metrics
where client = :client
  and amplifai_org = :org
  and amplifai_metric = :metric
  and year = :year
group by month, year
order by year, date_part('month', to_date(month || ' ' || year, 'Mon YYYY'));
```

### 2. Activity metrics summary

```sql
select
  program,
  metric_name,
  sum(actual) as total_actual,
  sum(goal) as total_goal
from activity_metrics
where client = :client
  and year = :year
group by program, metric_name
order by program, metric_name;
```

### 3. Behavioral coaching vs. performance join

```sql
with coaching as (
  select
    month,
    year,
    sum(coaching_count) as total_sessions,
    avg(effectiveness_pct) as avg_effectiveness
  from behavioral_coaching
  where client = :client
    and amplifai_org = :org
    and amplifai_metric = :metric
    and year = :year
  group by month, year
)
select
  m.month,
  m.year,
  m.actual,
  m.goal,
  c.total_sessions,
  c.avg_effectiveness
from monthly_metrics m
left join coaching c
  on c.month = m.month and c.year = m.year
where m.client = :client
  and m.amplifai_org = :org
  and m.amplifai_metric = :metric
  and m.year = :year
order by m.year, date_part('month', to_date(m.month || ' ' || m.year, 'Mon YYYY'));
```

### 4. Data quality snapshot

```sql
select
  (select count(*) from monthly_metrics where client = :client and year = :year) as monthly_rows,
  (select count(*) from activity_metrics where client = :client and year = :year) as activity_rows,
  (select count(*) from behavioral_coaching where client = :client and year = :year) as coaching_rows;
```

