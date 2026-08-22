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
