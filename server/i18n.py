"""server/i18n.py — bilingual (zh / en) UI strings (ADR-0026).

Why stdlib-only: CHARTER §8 forbids new runtime deps. Babel would add
~200 KB and a 4th non-stdlib dep; flat-dict i18n covers the ~200 string
slots the project exposes without that overhead.

How strings are addressed: dotted keys ('audit.title', 'nav.cockpit').
Why flat and not nested: greppable in PRs, easy set-comparison between
'en' and 'zh' for missing-translation audits.

How language is chosen (in order):
  1. URL query param    ?lang=zh|en
  2. Cookie             vcm_lang=zh|en
  3. Accept-Language    header (sniff first 2 chars; q-values ignored
                        for simplicity — a v0.15 enhancement)
  4. DEFAULT_LANGUAGE   ('zh'; overridable via env var
                        VCM_DEFAULT_LANGUAGE)

Failure modes:
  - unknown language code  -> DEFAULT_LANGUAGE
  - unknown string key     -> the key itself (greppable)
  - partial translation    -> zh falls through to en for missing keys
  - cookie tampered        -> ignored if not in LANGUAGES

Public API:
  LANGUAGES         list[str]
  DEFAULT_LANGUAGE  str
  STRINGS           dict[str, dict[str, str]]
  t(key, lang=DEFAULT_LANGUAGE) -> str
  detect_language(request)      -> str
  set_lang_cookie(response, lang)
  register_jinja(app)            -> wires t() + lang context global
"""

from __future__ import annotations

import os
import re
from typing import Optional


# --- Configuration --------------------------------------------------------

LANGUAGES: list[str] = ['en', 'zh']
DEFAULT_LANGUAGE: str = os.environ.get('VCM_DEFAULT_LANGUAGE', 'zh')

# Languages whose name tag is shown in its own script in the UI nav.
LANGUAGE_LABELS: dict[str, str] = {
    'en': 'English',
    'zh': '中文',
}


# --- String catalogue -----------------------------------------------------

EN: dict[str, str] = {
    # -- shell / nav --------------------------------------------------------
    'shell.title_prefix':           'vcm-server',
    'nav.cockpit':                  'cockpit',
    'nav.projects':                 'projects',
    'nav.skills':                   'skills',
    'nav.peers':                    'peers',
    'nav.audit':                    'audit',
    'nav.drift':                    'drift',
    'nav.trends':                   'trends',
    'nav.leaderboard':              'leaderboard',
    'nav.docs':                     'docs',
    'nav.settings':                 'settings',

    # -- common UI atoms ---------------------------------------------------
    'common.loading':                'Loading',
    'common.empty':                  'Empty',
    'common.filter':                 'Filter',
    'common.clear':                  'clear',
    'common.search':                 'search',
    'common.refresh':                'refresh',
    'common.export':                 'export',
    'common.close':                  'close',
    'common.all':                    'all',
    'common.apply':                  'apply',
    'common.from':                   'from',
    'common.to':                     'to',
    'common.total':                  'total',

    # -- answers line ------------------------------------------------------
    'answers.who_tried_to_do':       'who tried to do what, when, and was it allowed?',

    # -- / (cockpit / dashboard) ------------------------------------------
    'cockpit.title':                 'Cockpit',
    'cockpit.tagline':               'three numbers that answer "is anything wrong right now?"',

    # -- /audit ------------------------------------------------------------
    'audit.title':                   'Audit log',
    'audit.subtitle':                'Append-only JSONL at $VCM_AUDIT_LOG or ~/.vcm/audit.log.',
    'audit.filter.event_type':       'Event type',
    'audit.filter.since':            'Since (ISO date)',
    'audit.filter.limit':            'Limit',
    'audit.filter.project':          'Project',
    'audit.filter.source_ip':        'Source IP',
    'audit.col.timestamp':           'Timestamp (UTC)',
    'audit.col.event':               'Event',
    'audit.col.subject':             'Subject',
    'audit.col.detail':              'Detail',
    'audit.empty':                   'No audit events yet.',
    'audit.event_distribution':      'Event distribution',
    'audit.events_shown':            'events shown',

    # -- /drift ------------------------------------------------------------
    'drift.title':                   'Drift',
    'drift.subtitle':                'per-project governance gap score, sorted worst-first.',
    'drift.col.score':               'Score',
    'drift.col.project':             'Project',
    'drift.col.last_seen':           'Last seen',
    'drift.col.alerts':              'Alerts',
    'drift.empty':                   'No projects to score yet.',

    # -- /docs -------------------------------------------------------------
    'docs.search_placeholder':       'search docs',
    'docs.empty':                    'No docs.',

    # -- /settings ---------------------------------------------------------
    'settings.title':                'Settings',
    'settings.server':               'Server',
    'settings.version':              'Version',
    'settings.db_path':              'DB path',
    'settings.peers':                'Peers',
    'settings.language':             'Language',

    # -- /leaderboard + /peers + /projects + /trends + /skills -------------
    'leaderboard.title':             'Project leaderboard',
    'leaderboard.subtitle':          'which project is most compliant / has most debt / is stale?',
    'leaderboard.sort_by':           'Sort by',
    'peers.title':                   'Peers',
    'peers.subtitle':                'OSS projects we follow for governance inspiration.',
    'peers.watchlist':               'Watch list',
    'peers.empty':                   'No peers configured. Set $VCM_PEERS to a JSON file.',
    'trends.title':                  'Governance trend',
    'trends.subtitle':               'weekly buckets: compliance · td_count · skills · adrs · dirty.',
    'trends.metric':                 'Metric',
    'trends.filter.project':         'Project (or all)',
    'trends.filter.days_back':       'Days back',
    'skills.title':                  'Skill registry',
    'skills.subtitle':               'cross-project skill reach.',
    'skills.top_shared':             'Top 15 shared skills',
    'skills.all_by_usage':           'All skills, sorted by usage',
    'settings.title_full':           'Server settings',
    'settings.runtime':              'Runtime',
    'settings.service':              'Service',
    'settings.status':               'Status',
    'settings.answer':               'who is this server, who can call it, what does it know?',
    'drift.title_full':              'Cross-project drift',
    'drift.projects':                'Projects',
    'project.title_prefix':          'project',
    'answers.tag':                   'Answers',
    'common.loading_audit':          'Loading audit log…',
    'common.loading_trend':          'Loading trend…',
    'cockpit.subtitle':              'three numbers, plus six views into multi-project state.',

    # -- /dashboard (cockpit) ---------------------------------------------
    'cockpit.title':                 'Multi-project cockpit',
    'cockpit.lede':                  'all projects ranked by attention needed.',
    'cockpit.summary':               'three numbers, plus six views into multi-project state.',
    'cockpit.kpi.critical':          'critical projects',
    'cockpit.kpi.attention':         'projects needing attention',
    'cockpit.kpi.all_quiet':         'all quiet',
    'cockpit.kpi.registry':          'Registry footprint',
    'cockpit.kpi.skills':            'skills',
    'cockpit.tabs.overview':         'Overview',
    'cockpit.tabs.activity':         'Activity',
    'cockpit.matrix.title':          'Project health matrix',
    'cockpit.matrix.col.project':    'Project',
    'cockpit.matrix.col.agents':     'AGENTS',
    'cockpit.matrix.col.charter':    'CHARTER',
    'cockpit.matrix.col.skills':     'Skills',
    'cockpit.matrix.col.adrs':       'ADRs',
    'cockpit.matrix.col.tds':        'TDs',
    'cockpit.matrix.col.branch':     'Branch',
    'cockpit.matrix.col.tree':       'Tree',
    'cockpit.matrix.col.last_seen':  'Last seen',
    'cockpit.skills.title':          'Skill cross-project coverage',
    'cockpit.empty.projects':        'No projects yet — run',
    'cockpit.empty.projects.cmd':    'vcm push',
    'cockpit.empty.projects.suffix':  'from each.',
    'cockpit.empty.projects.healthy':'all projects healthy',
    'cockpit.empty.skills':          'No skills yet.',
    'cockpit.empty.activity':        'Nothing pushed yet — once projects call',
    'cockpit.empty.activity.cmd':    '/api/collect',
    'cockpit.empty.activity.suffix': 'you will see activity here.',
    'cockpit.attention.title':       'Needs attention',
    'cockpit.activity.title':        'Activity',
    'common.suffix.post_mortems':    'post-mortems',

    # -- /drift page internals --------------------------------------------
    'drift.lede':                    'which project should the vcm operator upgrade next?',
    'drift.kpi.high':                'high-drift projects (≥ 50)',
    'drift.kpi.avg':                 'avg score',
    'drift.kpi.longest_idle':        'longest idle',
    'drift.kpi.total':               'total projects',
    'drift.col.score':               'Score',
    'drift.col.project':             'Project',
    'drift.col.missing':             'Missing',
    'drift.col.recs':                'Recommendations',
    'drift.col.adrs':                'ADRs',
    'drift.col.days_idle':           'Days idle',
    'drift.col.last_seen':           'Last seen',
    'drift.col.alerts':              'Alerts',
    'drift.empty':                   'No projects to score yet.',
    'drift.loading':                 'Loading drift…',

    # -- /audit page internals --------------------------------------------
    'audit.events_shown':            'events shown',
    'audit.clear':                   'clear',
    'audit.events_section':          'Events',
    'audit.event_distribution':      'Event distribution',
    'audit.kpi.total':               'Total events',
    'audit.col.timestamp':           'Timestamp (UTC)',
    'audit.col.event':               'Event',
    'audit.col.subject':             'Subject',
    'audit.col.detail':              'Detail',
    'audit.event_distribution.bar':  'bars are stacked event counts since filter',
    'audit.health.requires_attention': 'requires attention',
    'audit.health.healthy_ingestion':  'healthy ingestion',
    'audit.event.auth_failure':      'auth failure',
    'audit.event.state_pushed':      'state pushed',
    'audit.event.state_rejected':    'state rejected',
    'audit.event.registry_publish':  'registry publish',
    'audit.event.registry_unpublish': 'registry unpublish',

    # -- /settings ---------------------------------------------------------
    'settings.answer':               'who is this server, who can call it, what does it know?',
    'settings.runtime':              'Runtime',
    'settings.service':              'Service',
    'settings.status':               'Status',
    'settings.version':              'Version',
    'settings.peers':                'Peers',

    # -- /trends -----------------------------------------------------------
    'trends.lede':                   'weekly buckets: compliance · td_count · skills · adrs · dirty.',
    'trends.metric':                 'Metric',
    'trends.col.week':               'Week',
    'trends.col.value':              'Value',
    'trends.filter.project':         'Project (or all)',
    'trends.filter.days_back':       'Days back',
    'trends.filter.all_projects':    'all projects',
    'trends.metric.compliance':      'compliance',
    'trends.metric.td_count':        'td_count',
    'trends.metric.skills':          'skills',
    'trends.metric.adrs':            'adrs',
    'trends.metric.dirty':           'dirty',
    'trends.metric.pushed':          'pushed',
    'trends.loading':                'Loading trend…',
    'trends.empty':                  'No data points in window.',
    'trends.chart.frame':            'Weekly trend chart',

    # -- /leaderboard ------------------------------------------------------
    'leaderboard.lede':              'which project is most compliant / has most debt / is stale?',
    'leaderboard.sort_by':           'Sort by',
    'leaderboard.sort.compliance':   'compliance',
    'leaderboard.sort.tds':          'technical debt',
    'leaderboard.sort.skills':       'skills',
    'leaderboard.sort.adrs':         'ADRs',
    'leaderboard.sort.last_seen':    'last seen',
    'leaderboard.sort.dirty':        'dirty tree',
    'leaderboard.rows_empty':        'No projects to rank yet.',
    'leaderboard.col.project':       'Project',
    'leaderboard.col.tds':           'TDs',
    'leaderboard.col.skills':        'Skills',
    'leaderboard.col.adrs':          'ADRs',
    'leaderboard.col.compliance':    'Compliance',
    'leaderboard.col.last_seen':     'Last seen',
    'leaderboard.col.dirty':         'Tree',
    'leaderboard.dirty':             'dirty',
    'leaderboard.clean':             'clean',

    # -- /skills -----------------------------------------------------------
    'skills.lede':                   'cross-project skill reach.',
    'skills.col.skill':              'Skill',
    'skills.col.tags':               'Tags',
    'skills.col.projects':           'Projects',
    'skills.col.last_used':          'Last used',
    'skills.col.reach':              'Reach',
    'skills.col.listing':            'Listing',
    'skills.col.adoption':           'Adoption',
    'skills.col.marketing':          'Marketing',
    'skills.col.reasoning':          'Reasoning',
    'skills.col.code':               'Code',
    'skills.col.lifecycle':          'Lifecycle',
    'skills.col.infra':              'Infra',
    'skills.col.workflow':           'Workflow',
    'skills.col.legacy':             'Legacy',
    'skills.empty':                  'No skills registered yet.',

    # -- /peers ------------------------------------------------------------
    'peers.lede':                    'OSS projects we follow for governance inspiration.',
    'peers.config_hint':             'Set $VCM_PEERS to a JSON file.',
    'peers.col.name':                'Name',
    'peers.col.repo':                'Repo',
    'peers.col.last_sync':           'Last sync',
    'peers.col.attention':           'attention',
    'peers.empty.configured':        'No peers configured.',

    # -- /project (single project) ----------------------------------------
    'project.lede':                  'is this project governable, what state is it in, and what is the last known snapshot?',
    'project.tabs.overview':         'Overview',
    'project.tabs.governance':       'Governance',
    'project.tabs.git':              'Git',
    'project.tabs.health':           'Health',
    'project.tabs.history':          'History',
    'project.kpi.governance':        'Governance',
    'project.kpi.tds':               'Tech debt',
    'project.kpi.tree':              'Working tree',
    'project.kpi.tree.dirty':        'dirty',
    'project.kpi.tree.clean':        'clean',
    'project.loading':               'Loading project state…',
    'project.not_found':             'Project not found.',
    'project.not_found.hint':        'It may have been removed, or',
    'project.not_found.cmd':         'vcm push',
    'project.not_found.suffix':      'was never called.',
    'project.not_found.back':        '← back to cockpit',
    'project.first_seen':            'first seen',
    'project.last_seen':             'last seen',
    'project.units.TDs':             'TDs',
    'project.units.skills':          'skills',
    'project.units.ADRs':            'ADRs',
    'project.units.entries':         'entries',
    'project.units.post_mortems':    'post-mortems',
    'project.git.branch':            'branch',
    'project.git.head':              'HEAD',

    # -- /docs -------------------------------------------------------------
    'docs.search_placeholder':       'search docs',
    'docs.no_matches':               'No matches.',
    'docs.toc_label':                'On this page',

    # -- nav partial (line-level labels) ----------------------------------
    'nav.stats.projects':            'projects',
    'nav.stats.skills':              'skills',
    'nav.stats.adrs':                'ADRs',

    # -- v0.14.1: comprehensive translation coverage --------------------
    # cockpit / dashboard extras
    'cockpit.kpi.projects':                  'Projects',
    'cockpit.kpi.projects_meta':             'fully healthy',
    'cockpit.kpi.with_warnings':             'with warnings',
    'cockpit.view_registry':                 'view registry →',
    'cockpit.skills.title':                  'Skill cross-project coverage',
    'cockpit.skills.title_short':            'Skill cross-project',
    'cockpit.skills.empty':                  'No skills yet.',
    'cockpit.attention.count_unit':          'project',
    'cockpit.attention.count_unit_plural':   'projects',
    'cockpit.attention.click_view':          'click view to inspect',
    'cockpit.attention.all_healthy':         'all projects healthy',
    'cockpit.attention.last_scan':           'No outstanding alerts. Last scan:',
    'cockpit.activity.title':                'Recent pushes',
    'cockpit.activity.health_radar':         'Health radar',
    'cockpit.activity.snapshot_at':          'snapshot at',
    'cockpit.activity.empty_prefix':         'Nothing pushed yet — once projects call',
    'cockpit.activity.empty_suffix':         'events show here.',
    'cockpit.lede.answers':                  "which projects are unhealthy, what they lack, and what's changed since you last looked.",

    # trends page extras
    'trends.subtitle.meta':                  'Weekly buckets · governance signals across registered projects.',
    'trends.lede.answers':                   'is the team getting more compliant or less, and which project is drifting?',
    'trends.option.compliance':              'Compliance (0..1)',
    'trends.option.td_count':                'Tech debt count',
    'trends.option.skills':                  'Skill count',
    'trends.option.adrs':                    'ADRs',
    'trends.option.dirty':                   'Dirty (0/1)',
    'trends.option.pushed':                  'Pushes/week',
    'trends.kpi.latest':                     'Latest value',
    'trends.kpi.latest_meta':                'week of',
    'trends.kpi.delta':                      'Δ vs prior week',
    'trends.kpi.delta_meta':                 'rolling',
    'trends.kpi.buckets':                    'Buckets with data',
    'trends.kpi.buckets_meta':               'out of',
    'trends.empty.hint':                     'Not enough data — push state at least once and check back next week.',
    'trends.weeks_unit':                     'week',
    'trends.weeks_unit_plural':              'weeks',

    # leaderboard extras
    'leaderboard.subtitle.meta':             'Rank every project by one metric. Click a row to inspect.',
    'leaderboard.lede.answers':              'which project owns the most tech debt / skills / ADRs, and which is most compliant?',
    'leaderboard.loading':                   'Loading leaderboard…',
    'leaderboard.col.branch':                'Branch',
    'leaderboard.col.days_idle':             'Days idle',
    'leaderboard.empty':                     'No projects ranked yet — push state from each to see them here.',
    'leaderboard.sort.label.td_count':       'Tech debt',
    'leaderboard.sort.label.skills':         'Skills',
    'leaderboard.sort.label.adrs':           'ADRs',
    'leaderboard.sort.label.compliance':     'Compliance',
    'leaderboard.sort.label.last_seen':      'Recency',
    'leaderboard.sort.label.dirty':          'Tree status',
    'leaderboard.sorted_by':                 'Sorted by',
    'leaderboard.projects_unit':             'project',
    'leaderboard.projects_unit_plural':      'projects',
    'leaderboard.order_label':               'order',
    'leaderboard.tree_dirty':                '⚠ dirty',
    'leaderboard.tree_clean':                '✓ clean',

    # peers extras
    'peers.subtitle.meta':                   'Public repositories we track for governance patterns.',
    'peers.lede.answers':                    "which OSS projects shape our governance decisions, and what's their latest signal?",
    'peers.loading':                         'Loading peer config…',
    'peers.empty.config_hint':               'No peers configured yet.',
    'peers.empty.cmd_prefix':                'On a project, run:',
    'peers.empty.cmd_detail':                'to start tracking an OSS repo as a peer.',
    'peers.col.stars':                       'Stars',
    'peers.col.note':                        'What we learn from it',
    'peers.col.fetched_at':                  'Last fetched',
    'peers.repos_tracked':                   'repos tracked',
    'peers.repo_unit':                       'repo',
    'peers.repo_unit_plural':                'repos',
    'peers.fetched_never':                   'never',

    # skills extras
    'skills.crumb':                          'skill registry',
    'skills.subtitle.meta':                  'All skills used by any project. Sorted by cross-project reach.',
    'skills.lede.answers':                   'which skills are reusable across projects, and which are stuck behind a single project?',
    'skills.kpi.unique':                     'Unique skills',
    'skills.kpi.unique_meta':                'across',
    'skills.kpi.shared':                     'Shared (≥ 2 projects)',
    'skills.kpi.shared_meta':                'good candidates for',
    'skills.kpi.shared_target':              '.vcm-skill.json',
    'skills.kpi.popular':                    'Most popular',
    'skills.kpi.popular_meta':               'used by',
    'skills.kpi.popular_unit':               'projects',
    'skills.tabs.chart':                     'Chart',
    'skills.tabs.full':                      'Full list',
    'skills.tabs.projects':                  'Projects',
    'skills.matrix.bars_meta':               'bars show number of projects using each',
    'skills.coverage.filter':                'name substring',
    'skills.coverage.no_match':              'No skills match',
    'skills.coverage.col.skill':             'Skill',
    'skills.coverage.col.projects':          'Projects',
    'skills.coverage.col.used_in':           'Used in',
    'skills.coverage.col.decision':          'Decision',
    'skills.coverage.decision.promote':      'promote to canonical?',
    'skills.coverage.decision.single':       'single-project',
    'skills.matrix.title':                   'Project × skill matrix',
    'skills.matrix.meta':                    'rows = projects, columns = skills',
    'skills.matrix.empty_prefix':            'No skills reported yet. Run',
    'skills.matrix.empty_suffix':            'in your projects.',

    # project (single-project detail) extras
    'project.lede.answers':                  "is this project governable, what state is it in, and what's the last known snapshot?",
    'project.kpi.ADRs':                      'ADRs',
    'project.kpi.tech_debts':                'Tech debts',
    'project.kpi.skills_label':              'Skills',
    'project.kpi.skills_meta':               'across',
    'project.kpi.skills_registered':         'registered',
    'project.overview.skills':               'Skills registered',
    'project.overview.skills_empty_prefix':  'No skills registered. Run',
    'project.overview.skills_empty_suffix':  'in the project.',
    'project.overview.facts':                'Quick facts',
    'project.overview.facts.name':           'Project name',
    'project.overview.facts.path':           'Path',
    'project.overview.facts.first':          'First push',
    'project.overview.facts.last':           'Last push',
    'project.governance.docs':               'Governance documents',
    'project.governance.col.doc':            'Document',
    'project.governance.col.status':         'Status',
    'project.governance.col.required':       'Required by CHARTER',
    'project.governance.AGENTS_required':    'Yes — project rules',
    'project.governance.CHARTER_required':   'Yes — constitutional rules',
    'project.governance.postmortems_required':'Encouraged — incident history',
    'project.governance.ADRs_meta':          'Architecture Decision Records',
    'project.governance.TDs_meta':           'TD-XXX entries in',
    'project.governance.skills_meta':        'across',
    'project.health.snapshot':               'Health snapshot',
    'project.health.empty_prefix':           'No health metrics reported yet. They appear after CI runs',
    'project.health.empty_suffix':           '',
    'project.history.title':                 'Push history',
    'project.history.meta':                  'states retained',
    'project.history.empty':                 'No prior states recorded.',
    'project.badge.present':                 'present',
    'project.badge.missing':                 'missing',
    'project.badge.entries':                 'entries',
    'project.skills_unit':                   'skill',
    'project.skills_unit_plural':            'skills',

    # settings extras
    'settings.subtitle':                     'Runtime configuration · read-only mirror of',
    'settings.subtitle_suffix':              'state.',
    'settings.lede.answers':                 "what is this server, where does it store things, and what's the live connection?",
    'settings.loading':                      'Loading server info…',
    'settings.database':                     'Database',
    'settings.tokens.title':                 'Design tokens (DESIGN.md §2)',
    'settings.tokens.intro':                 'The UI you are looking at reads tokens from',
    'settings.tokens.override':              'Override',
    'settings.tokens.at':                    'etc. at',
    'settings.tokens.toggle_prefix':         'Toggle the theme with the',
    'settings.tokens.toggle_suffix':         'button in the nav — your choice is persisted in',
    'settings.docs.title':                   'Documentation',
    'settings.docs.design_note':             '— the design system source',
    'settings.docs.adr0001_note':            '— why this redesign happened',
    'settings.docs.arch_note':               '— the 5-domain architecture',
    'settings.docs.charter_note':            '— constitutional rules (in repo root)',
    'settings.docs.api_note':                '— live server health JSON',
    'settings.docs.db':                      'Database',
    'settings.api_health_btn':               '/api/health',

    # docs viewer extras
    'docs.search_input':                     'Search docs…',
    'docs.files_count':                      'files',

    # audit facet chip labels (in-script x-text)
    'audit.facet.auth_failures':             'Auth failures',
    'audit.facet.no_failures':               'no failed attempts',
    'audit.facet.state_pushes':              'State pushes',
    'audit.facet.no_pushes':                 'no pushes yet',
    'audit.facet.source_ips':                'Source IPs',
    'audit.facet.projects':                  'Projects',
    'audit.detail.api_collect':              '/api/collect',
    'audit.detail.after_collect':            'Once any',
    'audit.detail.suffix':                   'or auth attempt happens, a JSONL line will appear here.',
    'cockpit.matrix.click_row':              'registered · click row for detail',
    'cockpit.activity.events':               'events',
    'cockpit.matrix.col.tree_dirty':         '⚠ dirty',
    'cockpit.matrix.col.tree_clean':         '✓ clean',


}

# Chinese catalogue. zh falls through to en for missing keys
# (see `t()` and `_lookup`), so partial translation is non-fatal.
ZH: dict[str, str] = {
    'shell.title_prefix':           'vcm-server',
    'nav.cockpit':                  '驾驶舱',
    'nav.projects':                 '项目',
    'nav.skills':                   '技能',
    'nav.peers':                    '节点',
    'nav.audit':                    '审计',
    'nav.drift':                    '漂移',
    'nav.trends':                   '趋势',
    'nav.leaderboard':              '排行榜',
    'nav.docs':                     '文档',
    'nav.settings':                 '设置',

    'common.loading':                '加载中',
    'common.empty':                  '空',
    'common.filter':                 '筛选',
    'common.clear':                  '清除',
    'common.search':                 '搜索',
    'common.refresh':                '刷新',
    'common.export':                 '导出',
    'common.close':                  '关闭',
    'common.all':                    '全部',
    'common.apply':                  '应用',
    'common.from':                   '从',
    'common.to':                     '至',
    'common.total':                  '合计',

    'answers.who_tried_to_do':       '谁在何时做了什么，是否被允许？',

    'cockpit.title':                 '驾驶舱',
    'cockpit.tagline':               '三个数字，回答"现在有没有异常？"',

    'audit.title':                   '审计日志',
    'audit.subtitle':                '追加式 JSONL，位于 $VCM_AUDIT_LOG 或 ~/.vcm/audit.log。',
    'audit.filter.event_type':       '事件类型',
    'audit.filter.since':            '起始时间（ISO）',
    'audit.filter.limit':            '条数',
    'audit.filter.project':          '项目',
    'audit.filter.source_ip':        '来源 IP',
    'audit.col.timestamp':           '时间戳（UTC）',
    'audit.col.event':               '事件',
    'audit.col.subject':             '对象',
    'audit.col.detail':              '详情',
    'audit.empty':                   '暂无审计事件。',
    'audit.event_distribution':      '事件分布',
    'audit.events_shown':            '条事件',

    'drift.title':                   '漂移',
    'drift.subtitle':                '各项目治理缺口评分，从重到轻排序。',
    'drift.col.score':               '分数',
    'drift.col.project':             '项目',
    'drift.col.last_seen':           '最后活动',
    'drift.col.alerts':              '告警',
    'drift.empty':                   '尚无项目可评分。',

    'docs.search_placeholder':       '搜索文档',
    'docs.empty':                    '暂无文档。',

    'settings.title':                '设置',
    'settings.server':               '服务器',
    'settings.version':              '版本',
    'settings.db_path':              '数据库路径',
    'settings.peers':                '节点',
    'settings.language':             '语言',

    'leaderboard.title':             '项目排行榜',
    'leaderboard.subtitle':          '哪个项目最合规 / 债务最多 / 久未更新？',
    'leaderboard.sort_by':           '排序',
    'peers.title':                   '节点',
    'peers.subtitle':                '我们关注的开源项目，作为治理参考。',
    'peers.watchlist':               '关注列表',
    'peers.empty':                   '尚未配置节点。在 $VCM_PEERS 设置 JSON 文件。',
    'trends.title':                  '治理趋势',
    'trends.subtitle':                '按周聚合：合规 · 技债 · 技能 · ADR · 脏树。',
    'trends.metric':                 '指标',
    'trends.filter.project':         '项目（或全部）',
    'trends.filter.days_back':       '回溯天数',
    'skills.title':                  '技能注册表',
    'skills.subtitle':               '跨项目技能覆盖度。',
    'skills.top_shared':             '共享最多的 15 个技能',
    'skills.all_by_usage':           '所有技能，按使用量排序',
    'settings.title_full':           '服务器设置',
    'settings.runtime':              '运行时',
    'settings.service':              '服务',
    'settings.status':               '状态',
    'settings.answer':                '这个服务器是谁，谁可以调用它，它知道什么？',
    'drift.title_full':              '跨项目漂移',
    'drift.projects':                '项目',
    'project.title_prefix':          '项目',
    'answers.tag':                   '答案',
    'common.loading_audit':          '正在加载审计日志…',
    'common.loading_trend':          '正在加载趋势…',
    'cockpit.subtitle':              '三个数字，加上六个面向多项目状态的视图。',

    'cockpit.title':                 '多项目驾驶舱',
    'cockpit.lede':                  '所有项目按"需要关注"排名。',
    'cockpit.summary':               '三个数字，加上六个面向多项目状态的视图。',
    'cockpit.kpi.critical':          '严重项目',
    'cockpit.kpi.attention':         '需要关注的项目',
    'cockpit.kpi.all_quiet':         '一切正常',
    'cockpit.kpi.registry':          '注册表足迹',
    'cockpit.kpi.skills':            '技能',
    'cockpit.tabs.overview':         '概览',
    'cockpit.tabs.activity':         '活动',
    'cockpit.matrix.title':          '项目健康矩阵',
    'cockpit.matrix.col.project':    '项目',
    'cockpit.matrix.col.agents':     'AGENTS',
    'cockpit.matrix.col.charter':    'CHARTER',
    'cockpit.matrix.col.skills':     '技能',
    'cockpit.matrix.col.adrs':       'ADR',
    'cockpit.matrix.col.tds':        '技债',
    'cockpit.matrix.col.branch':     '分支',
    'cockpit.matrix.col.tree':       '工作树',
    'cockpit.matrix.col.last_seen':  '最后活动',
    'cockpit.skills.title':          '技能跨项目覆盖',
    'cockpit.empty.projects':        '暂无项目——运行',
    'cockpit.empty.projects.cmd':    'vcm push',
    'cockpit.empty.projects.suffix':  '后即可看到。',
    'cockpit.empty.projects.healthy':'全部项目健康',
    'cockpit.empty.skills':          '暂无技能。',
    'cockpit.empty.activity':        '暂无推送——一旦项目调用',
    'cockpit.empty.activity.cmd':    '/api/collect',
    'cockpit.empty.activity.suffix': '，这里会显示活动。',
    'cockpit.attention.title':       '需要关注',
    'cockpit.activity.title':        '活动',
    'common.suffix.post_mortems':    '篇复盘',

    'drift.lede':                    'vcm operator 下一步应该升级哪个项目？',
    'drift.kpi.high':                '高漂移项目（≥ 50）',
    'drift.kpi.avg':                 '平均分',
    'drift.kpi.longest_idle':        '最长闲置',
    'drift.kpi.total':               '项目总数',
    'drift.col.score':               '分数',
    'drift.col.project':             '项目',
    'drift.col.missing':             '缺失',
    'drift.col.recs':                '建议',
    'drift.col.adrs':                'ADR',
    'drift.col.days_idle':           '闲置天数',
    'drift.col.last_seen':           '最后活动',
    'drift.col.alerts':              '告警',
    'drift.empty':                   '尚无项目可评分。',
    'drift.loading':                 '正在加载漂移视图…',

    'audit.events_shown':            '条事件',
    'audit.clear':                   '清除',
    'audit.events_section':          '事件',
    'audit.event_distribution':      '事件分布',
    'audit.kpi.total':               '总事件数',
    'audit.col.timestamp':           '时间戳（UTC）',
    'audit.col.event':               '事件',
    'audit.col.subject':             '对象',
    'audit.col.detail':              '详情',
    'audit.event_distribution.bar':  '条形为筛选后的事件堆叠数',
    'audit.health.requires_attention': '需要关注',
    'audit.health.healthy_ingestion':  '推送正常',
    'audit.event.auth_failure':      '认证失败',
    'audit.event.state_pushed':      '状态已推送',
    'audit.event.state_rejected':    '状态被拒',
    'audit.event.registry_publish':  '注册发布',
    'audit.event.registry_unpublish':'注册取消发布',

    'settings.answer':               '这个服务器是谁，谁可以调用它，它知道什么？',
    'settings.runtime':              '运行时',
    'settings.service':              '服务',
    'settings.status':               '状态',
    'settings.version':              '版本',
    'settings.peers':                '节点',

    'trends.lede':                   '按周聚合：合规 · 技债 · 技能 · ADR · 脏树。',
    'trends.metric':                 '指标',
    'trends.col.week':               '周',
    'trends.col.value':              '数值',
    'trends.filter.project':         '项目（或全部）',
    'trends.filter.days_back':       '回溯天数',
    'trends.filter.all_projects':    '全部项目',
    'trends.metric.compliance':      '合规',
    'trends.metric.td_count':        '技债',
    'trends.metric.skills':          '技能',
    'trends.metric.adrs':            'ADR',
    'trends.metric.dirty':           '脏树',
    'trends.metric.pushed':          '已推送',
    'trends.loading':                '正在加载趋势…',
    'trends.empty':                  '窗口内没有数据点。',
    'trends.chart.frame':            '周趋势图',

    'leaderboard.lede':              '哪个项目最合规 / 债务最多 / 久未更新？',
    'leaderboard.sort_by':           '排序',
    'leaderboard.sort.compliance':   '合规',
    'leaderboard.sort.tds':          '技债',
    'leaderboard.sort.skills':       '技能',
    'leaderboard.sort.adrs':         'ADR',
    'leaderboard.sort.last_seen':    '最后活动',
    'leaderboard.sort.dirty':        '脏树',
    'leaderboard.rows_empty':        '尚无项目可排名。',
    'leaderboard.col.project':       '项目',
    'leaderboard.col.tds':           '技债',
    'leaderboard.col.skills':        '技能',
    'leaderboard.col.adrs':          'ADR',
    'leaderboard.col.compliance':    '合规',
    'leaderboard.col.last_seen':     '最后活动',
    'leaderboard.col.dirty':         '工作树',
    'leaderboard.dirty':             '脏',
    'leaderboard.clean':             '干净',

    'skills.lede':                   '跨项目技能覆盖度。',
    'skills.col.skill':              '技能',
    'skills.col.tags':               '标签',
    'skills.col.projects':           '项目数',
    'skills.col.last_used':          '最后使用',
    'skills.col.reach':              '覆盖',
    'skills.col.listing':            '收录',
    'skills.col.adoption':           '采用',
    'skills.col.marketing':          '营销',
    'skills.col.reasoning':          '推理',
    'skills.col.code':               '代码',
    'skills.col.lifecycle':          '生命周期',
    'skills.col.infra':              '基础设施',
    'skills.col.workflow':           '工作流',
    'skills.col.legacy':             '遗留',
    'skills.empty':                  '尚无技能注册。',

    'peers.lede':                    '我们关注的开源项目，作为治理参考。',
    'peers.config_hint':             '设置 $VCM_PEERS 指向 JSON 文件。',
    'peers.col.name':                '名称',
    'peers.col.repo':                '仓库',
    'peers.col.last_sync':           '最后同步',
    'peers.col.attention':           '关注度',
    'peers.empty.configured':        '尚未配置节点。',

    'project.lede':                  '该项目是否可治理、当前状态、上次快照是什么？',
    'project.tabs.overview':         '概览',
    'project.tabs.governance':       '治理',
    'project.tabs.git':              'Git',
    'project.tabs.health':           '健康',
    'project.tabs.history':          '历史',
    'project.kpi.governance':        '治理',
    'project.kpi.tds':               '技债',
    'project.kpi.tree':              '工作树',
    'project.kpi.tree.dirty':        '脏',
    'project.kpi.tree.clean':        '干净',
    'project.loading':               '正在加载项目状态…',
    'project.not_found':             '项目不存在。',
    'project.not_found.hint':        '可能已被删除，或从未调用',
    'project.not_found.cmd':         'vcm push',
    'project.not_found.suffix':      '。',
    'project.not_found.back':        '← 返回驾驶舱',
    'project.first_seen':            '首次活动',
    'project.last_seen':             '最后活动',
    'project.units.TDs':             '条技债',
    'project.units.skills':          '项技能',
    'project.units.ADRs':            '篇 ADR',
    'project.units.entries':         '条记录',
    'project.units.post_mortems':    '篇复盘',
    'project.git.branch':            '分支',
    'project.git.head':              'HEAD',

    'docs.search_placeholder':       '搜索文档',
    'docs.no_matches':               '无匹配。',
    'docs.toc_label':                '本页',

    'nav.stats.projects':            '项目',
    'nav.stats.skills':              '项技能',
    'nav.stats.adrs':                '篇 ADR',

    # -- v0.14.1: comprehensive translation coverage --------------------
    # cockpit / dashboard extras
    'cockpit.kpi.projects':                  '项目',
    'cockpit.kpi.projects_meta':             '完全健康',
    'cockpit.kpi.with_warnings':             '存在告警',
    'cockpit.view_registry':                 '查看注册表 →',
    'cockpit.skills.title':                  '技能跨项目覆盖',
    'cockpit.skills.title_short':            '技能跨项目',
    'cockpit.skills.empty':                  '暂无技能。',
    'cockpit.attention.count_unit':          '个项目',
    'cockpit.attention.count_unit_plural':   '个项目',
    'cockpit.attention.click_view':          '点击 view 查看详情',
    'cockpit.attention.all_healthy':         '全部项目健康',
    'cockpit.attention.last_scan':           '无未处理告警。扫描时间：',
    'cockpit.activity.title':                '最近推送',
    'cockpit.activity.health_radar':         '健康雷达',
    'cockpit.activity.snapshot_at':          '快照时间',
    'cockpit.activity.empty_prefix':         '暂无推送——一旦项目调用',
    'cockpit.activity.empty_suffix':         '即可看到事件。',
    'cockpit.lede.answers':                  '哪些项目不健康、缺什么、自上次查看以来发生了什么变化？',

    # trends page extras
    'trends.subtitle.meta':                  '按周聚合 · 治理信号跨项目观察。',
    'trends.lede.answers':                   '团队合规度是上升还是下降，哪个项目在漂移？',
    'trends.option.compliance':              '合规度（0..1）',
    'trends.option.td_count':                '技债数',
    'trends.option.skills':                  '技能数',
    'trends.option.adrs':                    'ADR 数',
    'trends.option.dirty':                   '脏树（0/1）',
    'trends.option.pushed':                  '推送/周',
    'trends.kpi.latest':                     '最新值',
    'trends.kpi.latest_meta':                '所在周',
    'trends.kpi.delta':                      'Δ 与上周对比',
    'trends.kpi.delta_meta':                 '滚动',
    'trends.kpi.buckets':                    '有数据的桶',
    'trends.kpi.buckets_meta':               '共',
    'trends.empty.hint':                     '数据不足——至少推送一次状态后下周再看。',
    'trends.weeks_unit':                     '周',
    'trends.weeks_unit_plural':              '周',

    # leaderboard extras
    'leaderboard.subtitle.meta':             '按一个指标为每个项目排序，点击行查看详情。',
    'leaderboard.lede.answers':              '哪个项目技债/技能/ADR 最多，谁最合规？',
    'leaderboard.loading':                   '正在加载排行榜…',
    'leaderboard.col.branch':                '分支',
    'leaderboard.col.days_idle':             '闲置天数',
    'leaderboard.empty':                     '尚无项目可排名——从每个项目推送状态后会出现在此。',
    'leaderboard.sort.label.td_count':       '技债',
    'leaderboard.sort.label.skills':         '技能',
    'leaderboard.sort.label.adrs':           'ADR',
    'leaderboard.sort.label.compliance':     '合规度',
    'leaderboard.sort.label.last_seen':      '新鲜度',
    'leaderboard.sort.label.dirty':          '工作树状态',
    'leaderboard.sorted_by':                 '排序依据',
    'leaderboard.projects_unit':             '个项目',
    'leaderboard.projects_unit_plural':      '个项目',
    'leaderboard.order_label':               '顺序',
    'leaderboard.tree_dirty':                '⚠ 脏',
    'leaderboard.tree_clean':                '✓ 干净',

    # peers extras
    'peers.subtitle.meta':                   '我们跟踪的公共仓库，用于治理参考。',
    'peers.lede.answers':                    '哪些开源项目影响了我们的治理决策，它们的最新信号是什么？',
    'peers.loading':                         '正在加载节点配置…',
    'peers.empty.config_hint':               '尚未配置节点。',
    'peers.empty.cmd_prefix':                '在某个项目里运行：',
    'peers.empty.cmd_detail':                '即可开始把开源仓库作为节点跟踪。',
    'peers.col.stars':                       '星标',
    'peers.col.note':                        '可借鉴之处',
    'peers.col.fetched_at':                  '最近抓取',
    'peers.repos_tracked':                   '个仓库已跟踪',
    'peers.repo_unit':                       '个仓库',
    'peers.repo_unit_plural':                '个仓库',
    'peers.fetched_never':                   '从未',

    # skills extras
    'skills.crumb':                          '技能注册表',
    'skills.subtitle.meta':                  '任何项目使用的全部技能，按跨项目覆盖度排序。',
    'skills.lede.answers':                   '哪些技能可跨项目复用，哪些困在单个项目里？',
    'skills.kpi.unique':                     '独立技能',
    'skills.kpi.unique_meta':                '覆盖',
    'skills.kpi.shared':                     '共享（≥ 2 个项目）',
    'skills.kpi.shared_meta':                '适合抽成',
    'skills.kpi.shared_target':              '.vcm-skill.json',
    'skills.kpi.popular':                    '最热门',
    'skills.kpi.popular_meta':               '被',
    'skills.kpi.popular_unit':               '个项目使用',
    'skills.tabs.chart':                     '图表',
    'skills.tabs.full':                      '完整列表',
    'skills.tabs.projects':                  '项目',
    'skills.matrix.bars_meta':               '柱长表示使用该技能的项目数',
    'skills.coverage.filter':                '按名称筛选',
    'skills.coverage.no_match':              '没有匹配的技能',
    'skills.coverage.col.skill':             '技能',
    'skills.coverage.col.projects':          '项目数',
    'skills.coverage.col.used_in':           '使用项目',
    'skills.coverage.col.decision':          '决定',
    'skills.coverage.decision.promote':      '提升为标准技能？',
    'skills.coverage.decision.single':       '单项目',
    'skills.matrix.title':                   '项目 × 技能矩阵',
    'skills.matrix.meta':                    '行=项目，列=技能',
    'skills.matrix.empty_prefix':            '尚未上报技能。运行',
    'skills.matrix.empty_suffix':            '即可在项目中收集技能。',

    # project (single-project detail) extras
    'project.lede.answers':                  '该项目是否可治理、当前状态如何、上次快照是什么？',
    'project.kpi.ADRs':                      'ADR',
    'project.kpi.tech_debts':                '技债数',
    'project.kpi.skills_label':              '技能',
    'project.kpi.skills_meta':               '覆盖',
    'project.kpi.skills_registered':         '已注册',
    'project.overview.skills':               '已注册技能',
    'project.overview.skills_empty_prefix':  '尚未注册技能。运行',
    'project.overview.skills_empty_suffix':  '即可在本项目内注册。',
    'project.overview.facts':                '基本信息',
    'project.overview.facts.name':           '项目名',
    'project.overview.facts.path':           '路径',
    'project.overview.facts.first':          '首次推送',
    'project.overview.facts.last':           '最近推送',
    'project.governance.docs':               '治理文档',
    'project.governance.col.doc':            '文档',
    'project.governance.col.status':         '状态',
    'project.governance.col.required':       'CHARTER 要求',
    'project.governance.AGENTS_required':    '是——项目规则',
    'project.governance.CHARTER_required':   '是——宪章性规则',
    'project.governance.postmortems_required':'鼓励——事件复盘',
    'project.governance.ADRs_meta':          '架构决策记录',
    'project.governance.TDs_meta':           'TECH_DEBT.md 中的 TD-XXX',
    'project.governance.skills_meta':        '覆盖',
    'project.health.snapshot':               '健康快照',
    'project.health.empty_prefix':           '尚无健康指标。CI 运行',
    'project.health.empty_suffix':           '后会出现。',
    'project.history.title':                 '推送历史',
    'project.history.meta':                  '条状态已保留',
    'project.history.empty':                 '尚无历史状态。',
    'project.badge.present':                 '已存在',
    'project.badge.missing':                 '缺失',
    'project.badge.entries':                 '条记录',
    'project.skills_unit':                   '项技能',
    'project.skills_unit_plural':            '项技能',

    # settings extras
    'settings.subtitle':                     '运行时配置 · 仅作',
    'settings.subtitle_suffix':              '状态的只读镜像。',
    'settings.lede.answers':                 '这个服务器是谁、它把东西存在哪里、当前连接情况如何？',
    'settings.loading':                      '正在加载服务器信息…',
    'settings.database':                     '数据库',
    'settings.tokens.title':                 '设计令牌（DESIGN.md §2）',
    'settings.tokens.intro':                 '当前 UI 从',
    'settings.tokens.override':              '中读取令牌。在',
    'settings.tokens.at':                    '覆盖',
    'settings.tokens.toggle_prefix':         '使用导航栏上的',
    'settings.tokens.toggle_suffix':         '按钮切换主题——选择会持久化到',
    'settings.docs.title':                   '文档',
    'settings.docs.design_note':             '——设计系统源',
    'settings.docs.adr0001_note':            '——为何发生这次重设计',
    'settings.docs.arch_note':               '——五域架构',
    'settings.docs.charter_note':            '——宪章性规则（仓库根）',
    'settings.docs.api_note':                '——服务器健康 JSON',
    'settings.docs.db':                      '数据库',
    'settings.api_health_btn':               '/api/health',

    # docs viewer extras
    'docs.search_input':                     '搜索文档…',
    'docs.files_count':                      '个文件',

    # audit facet chip labels (in-script x-text)
    'audit.facet.auth_failures':             '认证失败',
    'audit.facet.no_failures':               '尚无失败',
    'audit.facet.state_pushes':              '状态推送',
    'audit.facet.no_pushes':                 '尚无推送',
    'audit.facet.source_ips':                '来源 IP',
    'audit.facet.projects':                  '项目',
    'audit.detail.api_collect':              '/api/collect',
    'audit.detail.after_collect':            '一旦任何',
    'audit.detail.suffix':                   '或鉴权请求发生，相应 JSONL 行就会出现在这里。',
    'cockpit.matrix.click_row':              '已注册 · 点击行查看详情',
    'cockpit.activity.events':               '条事件',
    'cockpit.matrix.col.tree_dirty':         '⚠ 脏',
    'cockpit.matrix.col.tree_clean':         '✓ 干净',


}


STRINGS: dict[str, dict[str, str]] = {'en': EN, 'zh': ZH}


# --- Helpers --------------------------------------------------------------

_VALID_LANG_RE = re.compile(r'^[a-z]{2,3}$', re.IGNORECASE)


def _normalize(lang: Optional[str]) -> Optional[str]:
    if not lang:
        return None
    lang = lang.strip().lower()
    return lang if lang in LANGUAGES else None


def _lookup(key: str, lang: str) -> str:
    """Look up `key` in the catalogue, falling through to en for any key
    that's missing in the active language. Returns the key itself on a
    total miss (so untranslated text shows its dotted path — greppable)."""
    bucket = STRINGS.get(lang, STRINGS[DEFAULT_LANGUAGE])
    if key in bucket:
        return bucket[key]
    if lang != 'en' and key in STRINGS['en']:
        return STRINGS['en'][key]
    return key


def t(key: str, lang: Optional[str] = None) -> str:
    """Translate `key` in the catalogue.

    `lang` defaults to `DEFAULT_LANGUAGE`. Returns the key string itself
    if it isn't translated yet (see ADR-0026 §Failure modes).
    """
    active = _normalize(lang) or DEFAULT_LANGUAGE
    return _lookup(key, active)


def detect_language(req) -> str:
    """Pick a language for the current request.

    Accepts either a Flask `request` object or a minimal dict shape with
    `args`, `cookies`, and an `Accept-Language` header.

    Resolution order:
      1. URL `?lang=`
      2. Cookie `vcm_lang`
      3. Accept-Language header (primary subtag of first entry)
      4. DEFAULT_LANGUAGE
    """
    if req is None:
        return DEFAULT_LANGUAGE

    # URL `?lang=` — works for both Flask request and dict inputs.
    args = getattr(req, 'args', None) or (req.get('args') if isinstance(req, dict) else None)
    if args is not None:
        # Werkzeug MultiDict and plain dict both expose .get().
        candidate = _normalize(args.get('lang'))
        if candidate:
            return candidate

    # Cookie 'vcm_lang'.
    cookies = getattr(req, 'cookies', None) or (req.get('cookies') if isinstance(req, dict) else None)
    if cookies is not None:
        candidate = _normalize(cookies.get('vcm_lang'))
        if candidate:
            return candidate

    # Accept-Language header.
    accept = None
    if isinstance(req, dict):
        accept = req.get('accept_language')
        if accept is None and req.get('headers'):
            accept = req['headers'].get('Accept-Language')
    else:
        headers = getattr(req, 'headers', None)
        if headers is not None:
            accept = headers.get('Accept-Language')

    if accept:
        # "en-US,en;q=0.9,zh;q=0.7" -> first entry -> primary subtag.
        first = accept.split(',')[0].strip().split(';')[0].strip()
        primary = first.split('-')[0].lower()
        if _VALID_LANG_RE.match(primary):
            candidate = _normalize(primary)
            if candidate:
                return candidate

    return DEFAULT_LANGUAGE


def set_lang_cookie(response, lang: str) -> None:
    """Persist the user's language choice in a session cookie."""
    response.set_cookie(
        'vcm_lang',
        lang,
        max_age=60 * 60 * 24 * 365,  # 1 year; treat as a user preference
        httponly=False,              # readable by JS only if needed; safe to be visible
        samesite='Lax',
    )


# --- Jinja2 integration ---------------------------------------------------

def register_jinja(app) -> None:
    """Wire `t`, `lang`, and the language-toggle URL builder into the
    Jinja2 environment used by Flask.

    After this call, every template can do:
        {{ t('audit.title') }}              # auto-picks language
        <html lang="{{ lang }}">
        <a href="{{ lang_url('en') }}">EN</a>

    Resolution order per request:
      URL `?lang=`  >  cookie `vcm_lang`  >  Accept-Language  >  default.

    Why `@template_global` not `app.jinja_env.globals['t'] = t`:
    Jinja env globals are evaluated at app-init time, so they can't see
    per-request state. A `template_global` callable is invoked per-render
    and lives inside the request context — which is exactly what we need
    for the auto-pick to follow URL/cookie/preference correctly.
    """
    from flask import request, url_for

    # Constant globals — set once.
    app.jinja_env.globals['LANGUAGES'] = LANGUAGES
    app.jinja_env.globals['LANGUAGE_LABELS'] = LANGUAGE_LABELS
    app.jinja_env.globals['DEFAULT_LANGUAGE'] = DEFAULT_LANGUAGE

    @app.template_global()
    def t(key: str) -> str:
        """Translate `key` for the current request's resolved language.
        Falls through: zh-missing -> en, then to the key itself.
        """
        lang = detect_language(request)
        return _lookup(key, lang)

    @app.template_filter()
    def to_json(value) -> str:
        """Render a Python value as JSON for inline <script> consumption.
        Wrapped in tojson-equivalent JSON-escape semantics (Flask ships
        this as a built-in, but we declare it for clarity)."""
        import json
        return json.dumps(value, ensure_ascii=False)

    @app.context_processor
    def _js_strings():
        """Inject `i18n_strings` (a dict of current-lang strings) plus
        `i18n_js` (the rendered JSON form) into every template.

        Templates can then do:
            <script>window.__vcm_i18n__ = {{ i18n_js | safe }};</script>
            const t = (k) => window.__vcm_i18n__[k] || k;
        and Alpine components can call `t('audit.title')` directly.
        """
        lang = detect_language(request)
        active = STRINGS.get(lang, STRINGS['en'])
        # Falls through to en for any missing key in the active lang.
        merged = {**STRINGS['en'], **active}
        return {
            'lang': lang,
            'i18n_strings': active,
            'i18n_merged': merged,
            'i18n_js': _to_json_str(merged),
        }

    def _to_json_str(d):
        import json
        return json.dumps(d, ensure_ascii=False)

    @app.template_global()
    def lang_url(target_lang: str) -> str:
        """Build a URL that switches the active language to `target_lang`,
        preserving the current path and other query params."""
        import urllib.parse
        # Preserve multi-value args; append the new ?lang= at the end.
        items = list(request.args.items(multi=True))
        items.append(('lang', target_lang))
        qs = urllib.parse.urlencode(items)
        sep = '&' if ('?' in request.full_path.rstrip('?')) else '?'
        base = request.path
        return f'{base}{sep}{qs}' if qs else base

    @app.context_processor
    def _i18n_context():
        lang = detect_language(request)
        # Set the cookie so the user's pick survives a refresh WITHOUT
        # `?lang=`. We only set the cookie when the active language
        # differs from the cookie value.
        if request.cookies.get('vcm_lang') != lang:
            request.environ['vcm.i18n.should_set_cookie'] = lang
        return {'lang': lang}

    @app.after_request
    def _i18n_set_cookie(response):
        lang = request.environ.get('vcm.i18n.should_set_cookie')
        if lang:
            set_lang_cookie(response, lang)
            request.environ.pop('vcm.i18n.should_set_cookie', None)
        return response
